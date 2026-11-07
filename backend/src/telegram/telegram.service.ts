import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../logging/audit.service';
import { type CatalogProduct } from '../catalog/discovery';
import { OrdersService } from '../orders/orders.service';
import { PaymentsService } from '../payments/payments.service';
import { type BotButton, composeReply, describeProduct, type BrainShop, productButtons } from './brain';
import { applyInput, draftTitle, promptFor, startDraft, summaryLines, type OrderDraft } from './order-flow';
import { readTelegramConfig, splitMessage, TelegramClient } from './telegram.client';

type TelegramChat = { id: number | string; type?: string; username?: string; first_name?: string };
type TelegramUser = { id: number | string; is_bot?: boolean; username?: string; first_name?: string };

export type IncomingMessage = {
  message_id: number;
  date: number;
  text?: string;
  /** زیرنویس عکس/ویدیو؛ برای پست فوروارد‌شده معمولاً همین متن دارد. */
  caption?: string;
  chat: TelegramChat;
  from?: TelegramUser;
  /** Bot API 7+: منبع فوروارد */
  forward_origin?: { type: string; chat?: { title?: string; username?: string }; sender_user?: TelegramUser; sender_user_name?: string };
  /** فیلدهای قدیمی فوروارد؛ بعضی کلاینت‌ها/نسخه‌ها هنوز همین را می‌فرستند. */
  forward_from?: TelegramUser;
  forward_from_chat?: { title?: string; username?: string };
  forward_sender_name?: string;
  forward_date?: number;
  photo?: unknown[];
  video?: unknown;
  document?: unknown;
  voice?: unknown;
  sticker?: unknown;
  location?: unknown;
  contact?: unknown;
};

export type IncomingCallback = {
  id: string;
  from: TelegramUser;
  data?: string;
  message?: { message_id: number; chat: TelegramChat };
};

export type IncomingUpdate = {
  update_id: number;
  message?: IncomingMessage;
  edited_message?: unknown;
  callback_query?: IncomingCallback;
};

export type HandleResult =
  | { status: 'ignored'; reason: string }
  | { status: 'duplicate' }
  | { status: 'handled'; replies: number; kind?: string };

/**
 * منطق پردازش update های تلگرام.
 *
 * قواعدی که عمداً رعایت شده‌اند:
 *  - هر update_id فقط یک‌بار پردازش می‌شود (تلگرام اگر ۲۰۰ نگیرد دوباره می‌فرستد).
 *  - پیام مشتری هرگز اجرا نمی‌شود؛ فقط از `answerFresh` رد می‌شود که هیچ حدسی
 *    نمی‌زند و در موارد نامطمئن به فروشنده ارجاع می‌دهد.
 *  - پاسخ‌دهی به مشتری و اعلان به فروشنده از هم جدا هستند: خطای اعلان نباید
 *    پاسخ مشتری را از بین ببرد و برعکس.
 *  - چت فروشنده (ownerChat) هرگز پاسخ خودکار نمی‌گیرد.
 */
@Injectable()
export class TelegramService {
  private readonly logger = new Logger('Telegram');
  private readonly client = new TelegramClient(readTelegramConfig());

  constructor(
    private readonly db: PrismaService,
    private readonly audit: AuditService,
    // چرخه‌ی عمدی و محدود: بات سفارش می‌سازد، سفارش‌ها با بات اعلان می‌دهند.
    @Inject(forwardRef(() => OrdersService)) private readonly orders: OrdersService,
    @Inject(forwardRef(() => PaymentsService)) private readonly payments: PaymentsService,
  ) {}

  get configured(): boolean {
    return this.client.configured;
  }

  /** کد کوتاه و خوانا برای لینک دعوت؛ بدون کاراکترهای گیج‌کننده (0/O, 1/I). */
  static generateCode(length = 8): string {
    const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
    let out = '';
    for (let index = 0; index < length; index += 1) {
      out += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    return out;
  }

  async handleUpdate(update: IncomingUpdate): Promise<HandleResult> {
    if (!Number.isInteger(update?.update_id)) return { status: 'ignored', reason: 'bad_update' };

    // idempotency: درج اتمیک؛ فقط خطای «تکراری» یعنی تلگرام دوباره فرستاده.
    // هر خطای دیگری (مثلاً دیتابیس در دسترس نیست) نباید به‌عنوان duplicate
    // گزارش شود؛ وگرنه پیام‌ها بی‌صدا گم می‌شوند و لاگ می‌گوید همه‌چیز خوب است.
    try {
      await this.db.telegramUpdate.create({ data: { updateId: BigInt(update.update_id) } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return { status: 'duplicate' };
      }
      this.logger.error(`ثبت update ${update.update_id} ناموفق: ${error instanceof Error ? error.message : 'unknown'}`);
      return { status: 'ignored', reason: 'persist_failed' };
    }

    // دکمه‌های inline (انتخاب محصول، مراحل سفارش) در callback_query می‌آیند، نه message.
    if (update.callback_query) return this.handleCallback(update.callback_query);

    const message = update.message;
    if (!message?.chat) return { status: 'ignored', reason: 'unsupported_type' };
    if (message.from?.is_bot) return { status: 'ignored', reason: 'from_bot' };

    const chatId = String(message.chat.id);
    // پست فوروارد‌شده معمولاً text ندارد و متنش در caption است.
    const text = (message.text ?? message.caption ?? '').trim();
    const forwarded = TelegramService.forwardSource(message);

    const command = /^\/(start|help|link|stop|orders)(?:@\w+)?(?:\s+(.+))?$/u.exec(text);
    if (command?.[1] === 'start') return this.start(chatId, message, command[2]?.trim() ?? '');
    if (command?.[1] === 'link') return this.linkOwner(chatId, message, command[2]?.trim() ?? '');
    if (command?.[1] === 'stop') return this.stop(chatId);
    if (command?.[1] === 'help') return this.help(chatId);
    if (command?.[1] === 'orders') return this.myOrders(chatId);
    if (text.startsWith('/')) return { status: 'ignored', reason: 'unknown_command' };

    if (!text) {
      if (!forwarded) return { status: 'ignored', reason: 'unsupported_type' };
      // پست فوروارد‌شده‌ی بدون متن: عکس/ویدیو است و ما فقط متن را می‌خوانیم.
      await this.send(chatId, [
        'این پست متنی ندارد که بتوانم محصولش را تشخیص بدهم.',
        'اسم یا کد محصول را بنویسید، یا متن پست را کپی و بفرستید.',
      ].join('\n'));
      return { status: 'handled', replies: 1, kind: 'forward_no_text' };
    }

    return this.customerMessage(chatId, text, message);
  }

  /**
   * منبع فوروارد، اگر پیام فوروارد شده باشد.
   * Bot API 7 `forward_origin` می‌فرستد و نسخه‌های قدیمی `forward_from*`؛ هر دو
   * بررسی می‌شوند تا با هر کلاینتی کار کند.
   */
  static forwardSource(message: IncomingMessage): string {
    const origin = message.forward_origin;
    if (origin) {
      return origin.chat?.title ?? origin.chat?.username ?? origin.sender_user?.first_name ?? origin.sender_user_name ?? origin.type;
    }
    return message.forward_from_chat?.title ?? message.forward_from_chat?.username ?? message.forward_from?.first_name ?? message.forward_sender_name ?? '';
  }

  // ---------------------------------------------------------------- /start CODE
  private async start(chatId: string, message: NonNullable<IncomingUpdate['message']>, payload: string): Promise<HandleResult> {
    // لینک فروشنده: start=own_<code>
    if (payload.startsWith('own_')) return this.linkOwner(chatId, message, payload.slice(4));

    const channel = payload
      ? await this.db.channel.findFirst({ where: { code: payload, active: true }, include: { shop: { select: { id: true, name: true, handoffMessage: true } } } })
      : null;

    if (!channel) {
      await this.send(chatId, 'سلام! برای ارتباط با فروشگاه، لینک اختصاصی فروشگاه را باز کنید.');
      return { status: 'handled', replies: 1, kind: 'no_code' };
    }

    // اگر خود فروشنده با کد مشتری وارد شد، به او بگوییم و چت را به‌عنوان فروشنده ثبت نکنیم
    if (channel.ownerChat === chatId) {
      await this.send(chatId, 'شما فروشنده‌ی این فروشگاه هستید؛ اعلان‌ها به همین چت می‌آید.');
      return { status: 'handled', replies: 1, kind: 'owner_start' };
    }

    await this.db.telegramConversation.upsert({
      where: { shopId_chatId: { shopId: channel.shopId, chatId } },
      update: { lastSeenAt: new Date(), username: message.chat.username ?? '', firstName: message.chat.first_name ?? '' },
      create: { shopId: channel.shopId, chatId, username: message.chat.username ?? '', firstName: message.chat.first_name ?? '' },
    });

    await this.send(chatId, `سلام 👋 به ${channel.shop.name} خوش آمدید.\nسؤال‌تان را بنویسید؛ درباره‌ی قیمت، موجودی و ارسال کمکتان می‌کنم.`);
    this.audit.record({ action: 'telegram.customer_start', entity: 'channel', entityId: channel.id, shopId: channel.shopId, meta: { chatId } });
    return { status: 'handled', replies: 1, kind: 'customer_start' };
  }

  // --------------------------------------------------------------- /start own_
  private async linkOwner(chatId: string, message: NonNullable<IncomingUpdate['message']>, code: string): Promise<HandleResult> {
    if (!code) {
      await this.send(chatId, 'کد اتصال را از پنل فروشیار (تنظیمات → اتصال تلگرام) بگیرید و به شکل /link CODE بفرستید.');
      return { status: 'handled', replies: 1, kind: 'owner_code_missing' };
    }
    const channel = await this.db.channel.findFirst({ where: { ownerCode: code }, include: { shop: { select: { id: true, name: true } } } });
    if (!channel) {
      await this.send(chatId, 'این کد معتبر یا منقضی شده است. از پنل یک کد تازه بگیرید.');
      return { status: 'handled', replies: 1, kind: 'owner_code_invalid' };
    }
    await this.db.channel.update({
      where: { id: channel.id },
      data: { ownerChat: chatId, ownerLinkedAt: new Date(), ownerCode: null },
    });
    // گفتگوی مشتری با همین چت را پاک کن تا اعلان‌های فروشنده با مکالمه‌ی مشتری قاطی نشود
    await this.db.telegramConversation.deleteMany({ where: { shopId: channel.shopId, chatId } });
    await this.send(chatId, `✅ این چت به «${channel.shop.name}» وصل شد.\nاز این پس اعلان فروش و موجودی کم را همین‌جا می‌گیرید.`);
    this.audit.record({ action: 'telegram.owner_linked', entity: 'channel', entityId: channel.id, shopId: channel.shopId, meta: { chatId, username: message.chat.username ?? '' } });
    return { status: 'handled', replies: 1, kind: 'owner_linked' };
  }

  private async stop(chatId: string): Promise<HandleResult> {
    const removed = await this.db.telegramConversation.deleteMany({ where: { chatId } });
    await this.send(chatId, removed.count > 0 ? 'گفتگو بسته شد. هر وقت خواستید دوباره از لینک فروشگاه وارد شوید.' : 'گفتگوی فعالی برای این چت نبود.');
    return { status: 'handled', replies: 1, kind: 'stop' };
  }

  private async help(chatId: string): Promise<HandleResult> {
    await this.send(chatId, [
      'کارهایی که می‌توانم انجام دهم:',
      '• قیمت و موجودی یک محصول',
      '• پیدا کردن محصول از روی پست فوروارد‌شده',
      '• ثبت سفارش و ساخت لینک پرداخت',
      '• شرایط ارسال و پرداخت و ساعت کاری',
      '',
      'دستورها: /orders (سفارش‌های من) · /stop (بستن گفتگو)',
      'برای موارد دیگر به فروشنده وصلتان می‌کنم.',
    ].join('\n'));
    return { status: 'handled', replies: 1, kind: 'help' };
  }

  // ---------------------------------------------------------------- مشتری
  private async customerMessage(chatId: string, text: string, message?: IncomingMessage): Promise<HandleResult> {
    const conversation = await this.db.telegramConversation.findFirst({ where: { chatId }, orderBy: { lastSeenAt: 'desc' } });
    if (!conversation) {
      await this.send(chatId, 'برای شروع، لینک اختصاصی فروشگاه را باز کنید.');
      return { status: 'handled', replies: 1, kind: 'no_conversation' };
    }

    const shop = await this.db.shop.findUniqueOrThrow({
      where: { id: conversation.shopId },
      select: { shipping: true, payment: true, workingHours: true, handoffMessage: true, name: true },
    });

    await this.db.telegramConversation.update({
      where: { id: conversation.id },
      data: { messageCount: { increment: 1 }, lastSeenAt: new Date() },
    });

    // ۱) اگر وسط سفارش است، ورودی صرفاً جواب همان مرحله است.
    const draft = TelegramService.readDraft(conversation.draft);
    if (draft) {
      // اگر مشتری صریحاً موضوع را عوض کرد، از سفارش بیرون می‌آییم (به‌جز مرحله‌ی تأیید).
      const escape = draft.step !== 'confirm' && /^(قیمت|موجودی|ارسال|ساعت)\b/u.test(text);
      if (escape) {
        await this.db.telegramConversation.update({ where: { id: conversation.id }, data: { draft: Prisma.DbNull } });
      } else {
        return this.continueOrder(conversation, draft, { text, telegramName: conversation.firstName });
      }
    }

    const products = await this.catalog(conversation.shopId);
    const forwardSource = message ? TelegramService.forwardSource(message) : '';
    const reply = composeReply(text, shop as BrainShop, products);

    let replies = 0;
    if (reply.kind === 'handoff' && /^(سفارش|خرید|میخوام بخرم|می‌خوام بخرم|سفارش بدم|می‌خوام سفارش بدم)$/u.test(text.trim()) && products.length > 0) {
      // «سفارش» بدون نام محصول: کاتالوگ را نشان می‌دهیم، حدس نمی‌زنیم.
      if (await this.sendWithButtons(chatId, 'کدام محصول را می‌خواهید؟', productButtons(products))) replies += 1;
      return { status: 'handled', replies, kind: 'catalog' };
    }

    const lines = [reply.text];
    if (forwardSource && reply.kind === 'handoff') {
      lines.unshift(`این پست از «${forwardSource}» است، ولی محصولش را در کاتالوگ فروشگاه پیدا نکردم.`);
    }
    if (await this.sendWithButtons(chatId, lines.join('\n'), reply.buttons)) replies += 1;

    if (reply.kind === 'handoff') {
      const notified = await this.notifyOwner(conversation.shopId, [
        `🔔 سؤال نیازمند پاسخ انسانی در «${shop.name}»`,
        `از: ${conversation.firstName || 'مشتری'}${conversation.username ? ` (@${conversation.username})` : ''}`,
        ...(forwardSource ? [`فوروارد از: ${forwardSource}`] : []),
        '',
        text,
      ].join('\n'));
      if (notified) replies += 1;
    }

    this.audit.record({
      action: 'telegram.message',
      entity: 'conversation',
      entityId: conversation.id,
      shopId: conversation.shopId,
      meta: { kind: reply.kind, reason: reply.reason ?? null, chars: text.length, forwarded: Boolean(forwardSource), handoffNotified: reply.kind === 'handoff' },
    });
    return { status: 'handled', replies, kind: reply.kind };
  }

  /** کاتالوگ فعال فروشگاه؛ سقف ۵۰۰ محصول مثل مسیر داشبورد. */
  private async catalog(shopId: string): Promise<CatalogProduct[]> {
    const products = await this.db.product.findMany({
      where: { shopId, active: true },
      take: 501,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        variants: { where: { active: true }, take: 12, select: { id: true, size: true, color: true, price: true, stock: true } },
      },
    });
    return products.length > 500 ? products.slice(0, 500) : products;
  }

  // ------------------------------------------------------------- دکمه‌های inline
  private async handleCallback(callback: IncomingCallback): Promise<HandleResult> {
    const chatId = String(callback.message?.chat.id ?? callback.from.id);
    const data = callback.data ?? '';
    // بدون این، چرخ‌لودینگ دکمه در گوشی مشتری گیر می‌کند.
    await this.client.answerCallbackQuery(callback.id).catch(() => undefined);

    const conversation = await this.db.telegramConversation.findFirst({ where: { chatId }, orderBy: { lastSeenAt: 'desc' } });
    if (!conversation) {
      await this.send(chatId, 'برای شروع، لینک اختصاصی فروشگاه را باز کنید.');
      return { status: 'handled', replies: 1, kind: 'no_conversation' };
    }
    await this.db.telegramConversation.update({ where: { id: conversation.id }, data: { lastSeenAt: new Date() } });

    // انتخاب محصول از لیست رفع ابهام
    if (data.startsWith('p:')) {
      const productId = data.slice(2);
      const product = (await this.catalog(conversation.shopId)).find(item => item.id === productId);
      if (!product) {
        await this.send(chatId, 'این محصول دیگر موجود نیست. کاتالوگ را دوباره ببینید: /help');
        return { status: 'handled', replies: 1, kind: 'product_gone' };
      }
      const reply = describeProduct(product, 'قیمت');
      const replies = (await this.sendWithButtons(chatId, reply.text, reply.buttons)) ? 1 : 0;
      this.audit.record({ action: 'telegram.product_pick', entity: 'conversation', entityId: conversation.id, shopId: conversation.shopId, meta: { productId, title: product.title } });
      return { status: 'handled', replies, kind: 'product_pick' };
    }

    // شروع سفارش برای یک سایز/رنگ مشخص
    if (data.startsWith('ord:')) {
      const variantId = data.slice(4);
      const variant = await this.db.variant.findFirst({
        where: { id: variantId, shopId: conversation.shopId, active: true },
        select: { id: true, size: true, color: true, price: true, stock: true, product: { select: { id: true, title: true, active: true } } },
      });
      if (!variant || !variant.product.active) {
        await this.send(chatId, 'این محصول دیگر در دسترس نیست.');
        return { status: 'handled', replies: 1, kind: 'variant_gone' };
      }
      if (variant.stock <= 0) {
        await this.send(chatId, `${variant.product.title} موجود نیست. اگر بخواهید به فروشنده اطلاع می‌دهم.`);
        await this.notifyOwner(conversation.shopId, `🔔 درخواست محصول ناموجود: ${variant.product.title}`);
        return { status: 'handled', replies: 1, kind: 'out_of_stock' };
      }
      const spec = [variant.size ? `سایز ${variant.size}` : '', variant.color ? `رنگ ${variant.color}` : ''].filter(Boolean).join('، ');
      const draft = startDraft({
        productId: variant.product.id,
        variantId: variant.id,
        title: variant.product.title,
        spec,
        price: variant.price,
        stock: variant.stock,
      });
      await this.saveDraft(conversation.id, draft);
      const prompt = promptFor(draft, conversation.firstName);
      const replies = (await this.sendWithButtons(chatId, prompt.text, prompt.buttons)) ? 1 : 0;
      this.audit.record({ action: 'telegram.order_started', entity: 'conversation', entityId: conversation.id, shopId: conversation.shopId, meta: { variantId, title: variant.product.title } });
      return { status: 'handled', replies, kind: 'order_started' };
    }

    // مراحل سفارش
    if (data.startsWith('flow:')) {
      const draft = TelegramService.readDraft(conversation.draft);
      if (!draft) {
        await this.send(chatId, 'سفارش فعالی نیست. از دکمه‌های محصول شروع کنید.');
        return { status: 'handled', replies: 1, kind: 'no_draft' };
      }
      return this.continueOrder(conversation, draft, { data, telegramName: conversation.firstName });
    }

    return { status: 'ignored', reason: 'unknown_callback' };
  }

  // ------------------------------------------------------------- سفارش در بات
  static readDraft(raw: unknown): OrderDraft | null {
    if (!raw || typeof raw !== 'object') return null;
    const draft = raw as OrderDraft;
    return typeof draft.step === 'string' && typeof draft.variantId === 'string' ? draft : null;
  }

  private async saveDraft(conversationId: string, draft: OrderDraft) {
    await this.db.telegramConversation.update({
      where: { id: conversationId },
      data: { draft: draft as unknown as Prisma.InputJsonValue },
    });
  }

  /** یک گام جلو رفتن در سفارش؛ حالت در draft می‌ماند تا ری‌استارت سرور گمش نکند. */
  private async continueOrder(
    conversation: { id: string; shopId: string; chatId: string; firstName: string },
    draft: OrderDraft,
    input: { text?: string; data?: string; telegramName?: string },
  ): Promise<HandleResult> {
    const outcome = applyInput(draft, input);

    if (outcome.kind === 'cancel') {
      await this.db.telegramConversation.update({ where: { id: conversation.id }, data: { draft: Prisma.DbNull } });
      await this.send(conversation.chatId, outcome.reply.text);
      this.audit.record({ action: 'telegram.order_cancelled', entity: 'conversation', entityId: conversation.id, shopId: conversation.shopId, meta: { title: draft.title } });
      return { status: 'handled', replies: 1, kind: 'order_cancelled' };
    }

    if (outcome.kind === 'ready') return this.finishOrder(conversation, outcome.draft);

    await this.saveDraft(conversation.id, outcome.draft);
    const sent = await this.sendWithButtons(conversation.chatId, outcome.reply.text, outcome.reply.buttons);
    return { status: 'handled', replies: sent ? 1 : 0, kind: outcome.kind === 'invalid' ? 'order_invalid' : 'order_step' };
  }

  /** ساخت سفارش + لینک پرداخت. موجودی همین‌جا رزرو می‌شود. */
  private async finishOrder(
    conversation: { id: string; shopId: string; chatId: string },
    draft: OrderDraft,
  ): Promise<HandleResult> {
    const publicUrl = PaymentsService.publicUrl;
    if (!publicUrl) {
      // بدون آدرس عمومی لینک پرداخت ساخته نمی‌شود؛ بهتر است روشن بگوییم تا سکوت.
      await this.send(conversation.chatId, 'فعلاً امکان ساخت لینک پرداخت نیست. سفارش شما را به فروشنده اطلاع دادم تا هماهنگ کند.');
      await this.notifyOwner(conversation.shopId, [
        `🔔 سفارش دستی: ${draftTitle(draft)} × ${(draft.quantity ?? 1).toLocaleString('fa-IR')}`,
        `گیرنده: ${draft.name ?? '—'} · ${draft.phone ?? '—'}`,
        `نشانی: ${draft.address ?? '—'}`,
        '',
        'PUBLIC_API_URL روی سرور تنظیم نشده، پس لینک پرداخت ساخته نشد.',
      ].join('\n'));
      await this.db.telegramConversation.update({ where: { id: conversation.id }, data: { draft: Prisma.DbNull } });
      return { status: 'handled', replies: 1, kind: 'order_no_payment' };
    }

    try {
      const order = await this.orders.create(conversation.shopId, {
        chatId: conversation.chatId,
        customerName: draft.name ?? '',
        customerPhone: draft.phone ?? '',
        address: draft.address ?? '',
        items: [{ variantId: draft.variantId, quantity: draft.quantity ?? 1 }],
      });
      const payment = await this.payments.start(
        conversation.shopId,
        { id: order.id, code: order.code, total: order.total, customerPhone: order.customerPhone },
        publicUrl,
      );
      await this.db.telegramConversation.update({ where: { id: conversation.id }, data: { draft: Prisma.DbNull } });

      const summary = summaryLines(draft).join('\n');
      const sent = await this.sendWithButtons(
        conversation.chatId,
        [
          `🧾 سفارش ${order.code} ساخته شد.`,
          summary,
          '',
          'برای تکمیل، روی دکمه‌ی پرداخت بزنید.',
          'اگر پرداخت نکنید، این سفارش تا ۲۴ ساعت آینده لغو و موجودی آزاد می‌شود.',
        ].join('\n'),
        [[{ text: `💳 پرداخت ${order.total.toLocaleString('fa-IR')} تومان`, url: payment.url }]],
      );

      this.audit.record({
        action: 'telegram.order_created',
        entity: 'order',
        entityId: order.id,
        shopId: conversation.shopId,
        meta: { code: order.code, total: order.total, provider: payment.provider, chatId: conversation.chatId },
      });
      return { status: 'handled', replies: sent ? 1 : 0, kind: 'order_created' };
    } catch (error) {
      await this.db.telegramConversation.update({ where: { id: conversation.id }, data: { draft: Prisma.DbNull } });
      const message = error instanceof Error ? error.message : 'سفارش ثبت نشد.';
      this.logger.warn(`ثبت سفارش ناموفق (${conversation.shopId}): ${message}`);
      await this.send(conversation.chatId, `سفارش ثبت نشد: ${message}\nاگر موجودی تمام شده، فروشنده به‌زودی به‌روزش می‌کند.`);
      return { status: 'handled', replies: 1, kind: 'order_failed' };
    }
  }

  /** /orders — سفارش‌های همین چت. */
  private async myOrders(chatId: string): Promise<HandleResult> {
    const conversation = await this.db.telegramConversation.findFirst({ where: { chatId }, orderBy: { lastSeenAt: 'desc' } });
    if (!conversation) {
      await this.send(chatId, 'برای شروع، لینک اختصاصی فروشگاه را باز کنید.');
      return { status: 'handled', replies: 1, kind: 'no_conversation' };
    }
    const orders = await this.orders.listForChat(conversation.shopId, chatId, 5);
    if (orders.length === 0) {
      await this.send(chatId, 'هنوز سفارشی ثبت نکرده‌اید.');
      return { status: 'handled', replies: 1, kind: 'orders_empty' };
    }
    const labels: Record<OrderStatus, string> = {
      [OrderStatus.AWAITING_PAYMENT]: 'در انتظار پرداخت',
      [OrderStatus.PAID]: 'پرداخت‌شده',
      [OrderStatus.SHIPPED]: 'ارسال‌شده',
      [OrderStatus.COMPLETED]: 'تحویل‌شده',
      [OrderStatus.CANCELLED]: 'لغوشده',
    };
    const lines = orders.map(order => [
      `${order.code} · ${labels[order.status]} · ${order.total.toLocaleString('fa-IR')} تومان`,
      order.items.map(item => `   • ${item.title}${item.spec ? ` (${item.spec})` : ''} × ${item.quantity.toLocaleString('fa-IR')}`).join('\n'),
    ].join('\n'));
    await this.send(chatId, ['🧾 سفارش‌های شما:', '', lines.join('\n\n')].join('\n'));
    return { status: 'handled', replies: 1, kind: 'orders' };
  }

  /** همان آستانه‌ی گزارش‌ها (reports.service) تا پنل و تلگرام یک چیز بگویند. */
  static readonly LOW_STOCK_THRESHOLD = 3;

  /**
   * اعلان فروش به فروشنده. fire-and-forget است و هرگز خطا را بالا نمی‌دهد:
   * ثبت فروش نباید به خاطر تلگرام شکست بخورد یا کند شود.
   */
  async notifySale(shopId: string, variantId: string, quantity: number): Promise<void> {
    try {
      const channel = await this.db.channel.findFirst({ where: { shopId, active: true }, select: { ownerChat: true } });
      if (!channel?.ownerChat?.trim()) return;
      const variant = await this.db.variant.findFirst({
        where: { shopId, id: variantId },
        select: { size: true, color: true, stock: true, price: true, product: { select: { title: true } } },
      });
      if (!variant) return;

      const spec = [variant.size ? `سایز ${variant.size}` : '', variant.color ? `رنگ ${variant.color}` : ''].filter(Boolean).join('، ');
      const lines = [
        `🛒 فروش ثبت شد`,
        `${variant.product.title}${spec ? ` (${spec})` : ''}`,
        `${quantity.toLocaleString('fa-IR')} عدد · ${(variant.price * quantity).toLocaleString('fa-IR')} تومان`,
        `موجودی باقی‌مانده: ${variant.stock.toLocaleString('fa-IR')}`,
      ];
      if (variant.stock === 0) lines.push('❌ این محصول تمام شد.');
      else if (variant.stock <= TelegramService.LOW_STOCK_THRESHOLD) lines.push('⚠️ موجودی کم است.');

      await this.send(channel.ownerChat.trim(), lines.join('\n'));
    } catch (error) {
      this.logger.warn(`notifySale ناموفق: ${error instanceof Error ? error.message : 'unknown'}`);
    }
  }

  // ---------------------------------------------------------------- اعلان فروشنده
  async notifyOwner(shopId: string, text: string): Promise<boolean> {
    const channel = await this.db.channel.findFirst({ where: { shopId, active: true }, select: { ownerChat: true } });
    // '' یعنی وصل‌نشده؛ بدون trim یک مقدار خالی به‌عنوان chatId به تلگرام می‌رفت.
    if (!channel?.ownerChat?.trim()) return false;
    return this.send(channel.ownerChat.trim(), text);
  }

  /** برای سفارش‌ها و پرداخت‌ها: ارسال پیام ساده به یک چت. */
  async sendTo(chatId: string, text: string): Promise<boolean> {
    return this.send(chatId, text);
  }

  /**
   * ارسال با دکمه‌های inline. دکمه‌ها فقط به تکه‌ی آخر می‌چسبند؛ اگر پیام طولانی
   * شد، دکمه‌ی نصفه وسط پیام نمی‌آید.
   */
  private async sendWithButtons(chatId: string, text: string, buttons?: BotButton[][]): Promise<boolean> {
    if (!buttons?.length) return this.send(chatId, text);
    if (!this.client.configured) {
      this.logger.warn(`TELEGRAM_BOT_TOKEN ست نشده؛ پیام به ${chatId} ارسال نشد.`);
      return false;
    }
    const inline_keyboard = buttons.map(row => row.map(button => (
      button.url
        ? { text: button.text, url: button.url }
        : { text: button.text, callback_data: button.data ?? '' }
    )));
    const parts = splitMessage(text);
    let allOk = true;
    for (const [index, part] of parts.entries()) {
      const result = await this.client.sendMessage({
        chat_id: chatId,
        text: part,
        ...(index === parts.length - 1 ? { reply_markup: { inline_keyboard } } : {}),
      });
      if (!result.ok) {
        allOk = false;
        this.logger.warn(`sendMessage به ${chatId} ناموفق: ${result.error}${result.description ? ` (${result.description})` : ''}`);
      }
    }
    return allOk;
  }

  /** ارسال با تکه‌بندی؛ نتیجه فقط برای شمارش/لاگ است و هرگز throw نمی‌شود. */
  private async send(chatId: string, text: string): Promise<boolean> {
    if (!this.client.configured) {
      this.logger.warn(`TELEGRAM_BOT_TOKEN ست نشده؛ پیام به ${chatId} ارسال نشد.`);
      return false;
    }
    let allOk = true;
    for (const part of splitMessage(text)) {
      const result = await this.client.sendMessage({ chat_id: chatId, text: part });
      if (!result.ok) {
        allOk = false;
        this.logger.warn(`sendMessage به ${chatId} ناموفق: ${result.error}${result.description ? ` (${result.description})` : ''}`);
      }
    }
    return allOk;
  }

  /** برای اسکریپت راه‌اندازی و پنل. */
  async botIdentity(): Promise<{ configured: boolean; username: string }> {
    if (!this.client.configured) return { configured: false, username: '' };
    const me = await this.client.getMe();
    return { configured: true, username: me.ok ? (me.result.username ?? '') : '' };
  }

  async registerWebhook(url: string, secret: string) {
    return this.client.setWebhook(url, secret);
  }

  async webhookInfo() {
    return this.client.getWebhookInfo();
  }

  /**
   * آدرس عمومی خود این سرویس. اول از `PUBLIC_API_URL`، وگرنه از هدرهای درخواست
   * (روی Render پشت پروکسی، `x-forwarded-*` درست است). آدرس باید https باشد چون
   * تلگرام http را نمی‌پذیرد.
   */
  static resolvePublicUrl(headers: Record<string, string | string[] | undefined>, env = process.env): string {
    const explicit = (env.PUBLIC_API_URL ?? '').trim().replace(/\/+$/, '');
    if (explicit) return explicit;
    const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? '';
    const host = first(headers['x-forwarded-host']) || first(headers.host);
    const proto = first(headers['x-forwarded-proto']) || 'https';
    return host ? `${proto}://${host}` : '';
  }
}
