import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { AuditService } from '../logging/audit.service';
import { discover, type CatalogProduct } from '../catalog/discovery';
import { AiService } from '../ai/ai.service';
import { OrdersService } from '../orders/orders.service';
import { ShopPaymentMethodsService } from '../payments/shop-payment-methods.service';
import { type BotButton, answerIntent, clarifyProducts, composeReply, describeProduct, type BrainShop, productButtons } from './brain';
import { addPersonality, resolveReply, type UnderstandResult } from '../ai/understand';
import { MAX_CLARIFY_ROUNDS, type IntentId } from './understanding';
import { applyInput, draftTitle, escapeHtml, fullAddress, promptFor, startDraft, type OrderDraft } from './order-flow';
import { readTelegramConfig, splitMessage, TelegramClient, type ReplyMarkup } from './telegram.client';
import { actionOf, actionsKeyboard, BOT_COMMANDS, helpText, welcomeText } from './menu';
import { isDeliveryConfirmation } from './delivery';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';

type TelegramChat = { id: number | string; type?: string; username?: string; first_name?: string };
/** پیامی که این پیام پاسخش است؛ برای «پاسخ فروشنده به مشتری» لازم است. */
type TelegramQuoted = { message_id: number; text?: string; caption?: string; from?: TelegramUser };
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
  reply_to_message?: TelegramQuoted;
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
  /**
   * کلاینت با اولین استفاده ساخته می‌شود و اگر توکن/آدرس عوض شود خودش را
   * دوباره می‌سازد. لازم است چون پنل ادمین می‌تواند توکن بات را بدون ری‌استارت
   * سرویس تغییر دهد و یک کلاینت ساخته‌شده با توکن قدیمی تا ابد کار نمی‌کرد.
   */
  private cached?: { client: TelegramClient; token: string; baseUrl: string };
  private get client(): TelegramClient {
    const config = readTelegramConfig();
    if (!this.cached || this.cached.token !== config.token || this.cached.baseUrl !== config.baseUrl) {
      this.cached = { client: new TelegramClient(config), token: config.token, baseUrl: config.baseUrl };
    }
    return this.cached.client;
  }

  constructor(
    private readonly db: PrismaService,
    private readonly audit: AuditService,
    // چرخه‌ی عمدی و محدود: بات سفارش می‌سازد، سفارش‌ها با بات اعلان می‌دهند.
    @Inject(forwardRef(() => OrdersService)) private readonly orders: OrdersService,
    @Inject(forwardRef(() => ShopPaymentMethodsService)) private readonly paymentMethods: ShopPaymentMethodsService,
    private readonly ai: AiService,
    // رخداد زنده برای پنل: پیام تازه، سفارش تازه، تغییر وضعیت.
    private readonly realtime: RealtimeService,
    private readonly subscriptions: SubscriptionsService,
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

    const command = /^\/(start|help|link|stop|orders|products|reply|chat)(?:@\w+)?(?:\s+([\s\S]+))?$/u.exec(text);

    // دستورهای مربوط به «ورود به فروشگاه» همیشه اول: فروشنده هم باید بتواند
    // دوباره وصل شود یا گفتگو را ببندد؛ وگرنه یک‌بار که چت فروشنده ثبت شد،
    // /link بعدی به‌عنوان پیام فروشنده تفسیر می‌شد.
    if (command?.[1] === 'start') return this.start(chatId, message, command[2]?.trim() ?? '');
    if (command?.[1] === 'link') return this.linkOwner(chatId, message, command[2]?.trim() ?? '');
    if (command?.[1] === 'stop') return this.stop(chatId);

    // اگر همین چتِ فروشنده است، پیامش یا پاسخ به مشتری است یا اعلان/دستور.
    const ownerOf = await this.ownerChannel(chatId);
    if (ownerOf) return this.sellerMessage(ownerOf, chatId, text, message);

    if (command?.[1] === 'help') return this.help(chatId);
    if (command?.[1] === 'orders') return this.myOrders(chatId);
    if (command?.[1] === 'products') return this.catalogMessage(chatId);
    if (text.startsWith('/')) return { status: 'ignored', reason: 'unknown_command' };

    // دکمه‌های کیبورد پایین چت: تلگرام فقط متن می‌فرستد، پس اینجا به عملیات
    // واقعی تبدیل می‌شوند (فهرست محصولات، راهنما، وصل‌شدن به فروشنده).
    const action = actionOf(text);
    if (action === 'catalog') return this.catalogMessage(chatId);
    if (action === 'help') return this.help(chatId);

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
      ? await this.db.channel.findFirst({ where: { code: payload, active: true, shop: { is: { active: true } } }, include: { shop: { select: { id: true, name: true, handoffMessage: true } } } })
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

    // خوش‌آمد حرفه‌ای + کیبورد عملیات: مشتری از همان پیام اول می‌بیند بات چه
    // می‌تواند بکند و لازم نیست چیزی تایپ کند.
    const shop = await this.db.shop.findUniqueOrThrow({
      where: { id: channel.shopId },
      select: { name: true, shipping: true, payment: true, workingHours: true, returns: true },
    });
    const productCount = await this.db.product.count({ where: { shopId: channel.shopId, active: true } });
    const capabilities = [
      productCount > 0 ? `${productCount.toLocaleString('fa-IR')} محصول` : '',
      shop.shipping.trim() ? 'ارسال' : '',
      shop.payment.trim() ? 'پرداخت' : '',
      shop.workingHours.trim() ? 'ساعت کاری' : '',
    ].filter(Boolean);
    await this.sendWithButtons(chatId, welcomeText({ name: shop.name, capabilities }), undefined, 'HTML');
    await this.send(chatId, 'یکی از گزینه‌ها را انتخاب کنید:', actionsKeyboard());
    this.botMenu();
    this.audit.record({ action: 'telegram.customer_start', entity: 'channel', entityId: channel.id, shopId: channel.shopId, meta: { chatId } });
    return { status: 'handled', replies: 2, kind: 'customer_start' };
  }

  // --------------------------------------------------------------- /start own_
  private async linkOwner(chatId: string, message: NonNullable<IncomingUpdate['message']>, code: string): Promise<HandleResult> {
    if (!code) {
      await this.send(chatId, 'کد اتصال را از پنل فروشیار (تنظیمات → اتصال تلگرام) بگیرید و به شکل /link CODE بفرستید.');
      return { status: 'handled', replies: 1, kind: 'owner_code_missing' };
    }
    const channel = await this.db.channel.findFirst({ where: { ownerCode: code, shop: { is: { active: true } } }, include: { shop: { select: { id: true, name: true } } } });
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
    const conversation = await this.db.telegramConversation.findFirst({ where: { chatId, shop: { is: { active: true } } }, orderBy: { lastSeenAt: 'desc' } });
    const shop = conversation
      ? await this.db.shop.findUnique({
        where: { id: conversation.shopId },
        select: { name: true, shipping: true, payment: true, workingHours: true, returns: true },
      })
      : null;
    const text = shop
      ? helpText(shop)
      : ['<b>راهنمای بات</b>', 'برای دیدن محصولات و قیمت‌ها، لینک اختصاصی فروشگاه را باز کنید.'].join('\n');
    await this.sendWithButtons(chatId, text, undefined, 'HTML');
    await this.send(chatId, 'یکی از گزینه‌ها را انتخاب کنید:', actionsKeyboard());
    return { status: 'handled', replies: 2, kind: 'help' };
  }

  /**
   * فهرست محصولات فعال فروشگاه با دکمه‌ی هر محصول.
   * `/products` و دکمه‌ی «محصولات و قیمت‌ها» به همین‌جا می‌رسند.
   */
  private async catalogMessage(chatId: string): Promise<HandleResult> {
    const conversation = await this.db.telegramConversation.findFirst({ where: { chatId, shop: { is: { active: true } } }, orderBy: { lastSeenAt: 'desc' } });
    if (!conversation) {
      await this.send(chatId, 'برای دیدن محصولات، اول لینک اختصاصی فروشگاه را باز کنید.');
      return { status: 'handled', replies: 1, kind: 'no_conversation' };
    }
    const products = await this.catalog(conversation.shopId);
    if (products.length === 0) {
      await this.send(chatId, 'فهرست محصولات هنوز خالی است؛ فروشنده به‌زودی اضافه می‌کند.');
      return { status: 'handled', replies: 1, kind: 'catalog_empty' };
    }
    const reply = clarifyProducts(products, 'محصولات فروشگاه', 0);
    await this.sendWithButtons(chatId, reply.text, reply.buttons, reply.parseMode);
    return { status: 'handled', replies: 1, kind: 'catalog' };
  }

  /**
   * ثبت فهرست فرمان‌ها و حالت منوی ☰ — یک‌بار برای هر توکن.
   *
   * عمداً fire-and-forget: اگر تلگرام در دسترس نباشد (یا توکن تازه باشد و هنوز
   * تأیید نشده باشد)، راه‌اندازی سرویس و پاسخ‌دهی بات نباید متوقف شود.
   */
  private menuToken = '';
  botMenu(): void {
    const token = (process.env.TELEGRAM_BOT_TOKEN ?? '').trim();
    if (!token || token === this.menuToken) return;
    this.menuToken = token;
    void (async () => {
      const config = readTelegramConfig();
      const client = new TelegramClient(config);
      const [commands, button] = await Promise.all([
        client.setMyCommands(BOT_COMMANDS),
        client.setChatMenuButton(),
      ]);
      if (!commands.ok) this.logger.warn(`ثبت فهرست فرمان‌های بات انجام نشد: ${commands.description ?? commands.error}`);
      if (!button.ok) this.logger.debug?.(`ثبت منوی چت انجام نشد: ${button.description ?? button.error}`);
    })().catch(() => undefined);
  }

  // ---------------------------------------------------------------- مشتری
  private async customerMessage(chatId: string, text: string, message?: IncomingMessage): Promise<HandleResult> {
    const conversation = await this.db.telegramConversation.findFirst({ where: { chatId, shop: { is: { active: true } } }, orderBy: { lastSeenAt: 'desc' } });
    if (!conversation) {
      await this.send(chatId, 'برای شروع، لینک اختصاصی فروشگاه را باز کنید.');
      return { status: 'handled', replies: 1, kind: 'no_conversation' };
    }
    if (!(await this.subscriptions.status(conversation.shopId)).active) {
      await this.send(chatId, 'دورهٔ آزمایشی این فروشگاه به پایان رسیده و پاسخ‌گویی موقتاً متوقف است. اطلاعات شما حفظ شده است.');
      return { status: 'handled', replies: 1, kind: 'subscription_expired' };
    }

    const shop = await this.db.shop.findUniqueOrThrow({
      where: { id: conversation.shopId },
      select: { id: true, shipping: true, payment: true, workingHours: true, returns: true, handoffMessage: true, name: true },
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

    // نقل‌قول: مشتری روی یک پیام (معمولاً پیام بات/فروشنده) ریپلای زده است.
    const quoted = message?.reply_to_message
      ? {
        text: (message.reply_to_message.text ?? message.reply_to_message.caption ?? '').slice(0, 300),
        from: message.reply_to_message.from?.is_bot ? 'out' : 'in',
      }
      : null;

    // «تحویل گرفتم» پیش از هر قاعده‌ای بررسی می‌شود.
    // چرا اول: قاعده‌ی «ارسال و تحویل» به همین واژه می‌چسبد و قبلاً به مشتری
    // هزینه‌ی پست را توضیح می‌داد، در حالی که منظورش تأیید دریافت بود.
    if (isDeliveryConfirmation(text)) {
      const confirmed = await this.confirmDelivery(conversation, chatId, text, quoted);
      if (confirmed) return confirmed;
    }
    // چند پیام نامفهوم پشت‌سرهم؟ تا ۳ بار سؤال می‌پرسیم، بعد از آن ارجاع.
    const round = TelegramService.clarifyRound(conversation.clarify);
    let reply = composeReply(text, shop as BrainShop, products, { round });

    // اگر موتور قاعده‌محور پیام را نفهمید، مدل زبانی (اگر وصل باشد) یک بار
    // شانس دارد. سفارش و پرداخت هرگز به مدل سپرده نمی‌شوند؛ فقط پاسخ‌دادن.
    // مدل زبانی وقتی کمک می‌کند که قاعده‌ها «نفهمیدم» یا «داده‌اش را ندارم» بدهند.
    // پاسخ روشنِ قاعده‌محور و مسیر سفارش هرگز با مدل جایگزین نمی‌شود.
    // فقط وقتی قاعده‌محور مطمئن نیست. `resolveReply` خودش تشخیص می‌دهد
    // «پیدا نشد» یعنی محصول نبوده یا مشتری با واژه‌ی دیگری گفته است.
    // بودجه‌ی زمانی مدل: پاسخ باید سریع برسد (درخواست کاربر).
    // بدون این سقف، یک مدل کند تا AI_TIMEOUT_MS (۱۲ ثانیه) مشتری را منتظر
    // نگه می‌داشت. با سقف ۴ ثانیه، بدترین حالت هم پاسخ قاعده‌محورِ آماده است.
    if (this.ai.enabled && reply.kind !== 'order') {
      const budget = Number(process.env.AI_REPLY_BUDGET_MS ?? 4000);
      const history = await this.recentMessages(conversation.shopId, chatId, 8);
      const resolved = await this.withBudget(
        resolveReply({ ai: this.ai, shop: shop as BrainShop, products, text, rule: reply, history }),
        budget,
        reply,
      ) as UnderstandResult;
      // لایه‌ی دوم: همان پاسخ (قاعده‌محور، تطبیق محصول، یا پاسخ مدل) با لحن
      // فروشگاه بازنویسی می‌شود؛ داده و ساختار با نگهبان قفل است. مسیر سفارش و
      // ارجاع از این لایه بیرون‌اند.
      // بازنویسی لحن (همان قابلیتِ «پاسخ با لحن فروشگاه») ولی با سقف زمانی:
      // اگر مدل دیر کند، متن آماده **همین حالا** می‌رود. مسیر سفارش و ارجاع
      // از این لایه بیرون‌اند تا داده و مرحله دست‌نخورده بماند.
      const understood = resolved.kind === 'order' || resolved.kind === 'handoff'
        ? resolved
        : await this.withBudget(
          addPersonality(this.ai, shop as BrainShop, resolved, text),
          Math.max(1200, budget - 2500),
          resolved,
        ) as UnderstandResult;

      if (understood.source !== 'rules') {
        // `parseMode` باید همراه پاسخ بماند؛ اگر جا بیفتد، تگ‌های <b>/<i>/<code>
        // عیناً در تلگرام نمایش داده می‌شوند (باگ گزارش‌شده).
        reply = {
          kind: understood.kind,
          reason: understood.reason,
          text: understood.text,
          buttons: understood.buttons,
          parseMode: understood.parseMode ?? reply.parseMode,
        };
        this.audit.record({
          action: understood.source === 'ai_match'
            ? 'telegram.ai_match'
            : understood.source === 'ai_polished'
              ? 'telegram.ai_polished'
              : 'telegram.ai_answer',
          entity: 'conversation', entityId: conversation.id, shopId: conversation.shopId,
          meta: { model: this.ai.model, match: understood.ai?.match, keywords: understood.ai?.keywords, query: text.slice(0, 120) },
        });
      } else if (understood.ai?.skip) {
        this.audit.record({
          action: 'telegram.ai_skipped', entity: 'conversation', entityId: conversation.id,
          shopId: conversation.shopId, meta: { reason: understood.ai.skip },
        });
      }
    }

    if (process.env.DEBUG_CLARIFY) this.logger.debug(`clarify round=${round} text=${text} kind=${reply.kind} reason=${reply.reason}`);

    // پاسخ روشن → شمارنده‌ی «نفهمیدم» صفر می‌شود؛ سؤال روشن‌کننده → یکی جلو.
    const unclear = reply.kind === 'clarify' && (reply.reason ?? '').startsWith('unclear');
    // پرسشِ فهرست صفحه‌بندی‌شده ذخیره می‌شود تا دکمه‌ی «بعدی» همان محصولات را
    // دوباره بسازد (و نه کاتالوگ کامل را).
    const clarifyState = unclear
      ? { round: round + 1, last: text.slice(0, 200) }
      : reply.listQuery
        ? { round: 0, listQuery: reply.listQuery }
        : null;
    await this.db.telegramConversation.update({
      where: { id: conversation.id },
      data: { clarify: clarifyState ?? Prisma.DbNull },
    });

    let replies = 0;
    if (reply.kind === 'handoff' && /^(سفارش|خرید|میخوام بخرم|می‌خوام بخرم|سفارش بدم|می‌خوام سفارش بدم)$/u.test(text.trim()) && products.length > 0) {
      // «سفارش» بدون نام محصول: کاتالوگ را نشان می‌دهیم، حدس نمی‌زنیم.
      if (await this.sendWithButtons(chatId, 'کدام محصول را می‌خواهید؟', productButtons(products))) replies += 1;
      return { status: 'handled', replies, kind: 'catalog' };
    }

    // پیام مشتری برای تاریخچه‌ی گفتگو (پنل و /chat) ثبت می‌شود.
    await this.logInbound(conversation.shopId, chatId, text, quoted);

    const lines = [reply.text];
    if (forwardSource && reply.kind === 'handoff') {
      lines.unshift(`این پست از «${forwardSource}» است، ولی محصولش را در کاتالوگ فروشگاه پیدا نکردم.`);
    }
    const outbound = lines.join('\n');
    if (await this.sendWithButtons(chatId, outbound, reply.buttons, reply.parseMode)) {
      replies += 1;
      // پاسخ بات هم در تاریخچه می‌نشیند؛ وگرنه پنل فقط نیمی از گفتگو را نشان
      // می‌داد و فروشنده نمی‌دانست بات چه گفته است (درخواست کاربر).
      await this.logOutbound(conversation.shopId, chatId, outbound, 'bot');
    }

    if (reply.kind === 'handoff') {
      const code = TelegramService.conversationCode(conversation.id);
      const transcript = await this.recentTranscript(conversation.shopId, chatId, 6);
      const notified = await this.notifyOwner(conversation.shopId, [
        `🔔 <b>سؤال نیازمند پاسخ انسانی</b> در «${escapeHtml(shop.name)}»`,
        `از: ${escapeHtml(conversation.firstName || 'مشتری')}${conversation.username ? ` (@${escapeHtml(conversation.username)})` : ''}`,
        ...(forwardSource ? [`فوروارد از: ${escapeHtml(forwardSource)}`] : []),
        '',
        escapeHtml(text),
        ...(transcript ? ['', '<b>چند پیام آخر:</b>', ...transcript.map(line => `<i>${escapeHtml(line)}</i>`)] : []),
        '',
        ...(reply.reason?.startsWith('unclear') || reply.reason?.startsWith('no_data')
          ? [`⚠️ بات بعد از ${MAX_CLARIFY_ROUNDS.toLocaleString('fa-IR')} بار پرسیدن، منظور مشتری را نفهمید.`]
          : []),
        `↩️ برای پاسخ، روی همین پیام «پاسخ» بزنید.`,
        `#گفتگو ${code}`,
      ].join('\n'), true);
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

  /** تعداد سؤال‌های روشن‌کننده‌ای که تا حالا پرسیده‌ایم. */
  static clarifyRound(value: unknown): number {
    if (!value || typeof value !== 'object') return 0;
    const round = (value as { round?: unknown }).round;
    return typeof round === 'number' && round > 0 && round < 50 ? round : 0;
  }

  /** چند پیام آخر گفتگو، برای اینکه فروشنده بفهمد مشتری چه گفته بود. */
  private async recentTranscript(shopId: string, chatId: string, take = 6): Promise<string[]> {
    try {
      const rows = await this.db.chatMessage.findMany({
        where: { shopId, chatId },
        orderBy: { createdAt: 'desc' },
        take,
        select: { direction: true, text: true },
      });
      return rows.reverse().map(item => `${item.direction === 'in' ? 'مشتری' : 'فروشنده'}: ${item.text.slice(0, 120)}`);
    } catch {
      return [];
    }
  }

  /** ثبت پیام مشتری در تاریخچه‌ی گفتگو؛ خطا نباید مسیر اصلی را بشکند. */
  /**
   * ثبت پیام مشتری در تاریخچه.
   *
   * اگر مشتری روی پیام فروشنده «ریپلای» زده باشد (`reply_to_message`)، متن آن
   * پیام هم کپی می‌شود تا در پنل، نقل‌قول بالای پیام دیده شود — همان کاری که
   * خود تلگرام انجام می‌دهد.
   */
  private async logInbound(shopId: string, chatId: string, text: string, reply?: { text: string; from: string } | null): Promise<void> {
    try {
      const saved = await this.db.chatMessage.create({
        data: {
          shopId, chatId, direction: 'in', author: 'customer', text: text.slice(0, 4000),
          replyText: (reply?.text ?? '').slice(0, 300),
          replyFrom: (reply?.from ?? '').slice(0, 8),
        },
        select: { id: true },
      });
      this.realtime.emitShop(shopId, 'chat', { chatId, messageId: saved.id, author: 'customer' });
      this.realtime.emitAdmin('chat', { shopId, chatId });
    } catch (error) {
      this.logger.warn(`ثبت پیام مشتری ناموفق: ${error instanceof Error ? error.message : 'unknown'}`);
    }
  }

  /**
   * اجرای یک کار اختیاری با بودجه‌ی زمانی.
   *
   * اگر مدل دیر کند، به‌جای انتظار، `fallback` برمی‌گردد — که همیشه یک پاسخ
   * آماده و درست است. عمداً promise را cancel نمی‌کنیم (fetch داخلی خودش
   * AbortSignal دارد)؛ فقط دیگر منتظرش نمی‌مانیم.
   */
  private async withBudget<T>(work: Promise<T>, ms: number, fallback: T): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    const guard = new Promise<T>(resolve => {
      timer = setTimeout(() => resolve(fallback), ms);
    });
    try {
      return await Promise.race([work.catch(() => fallback), guard]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /**
   * پاک‌کردن تگ‌های HTML تلگرام برای نمایش در پنل.
   *
   * پیام‌ها با `<b>`/`<i>`/`<code>` به تلگرام می‌روند؛ پنل متن ساده نشان می‌دهد،
   * پس اگر همان رشتهٔ خام ذخیره شود، کاربر تگ‌ها را عیناً می‌بیند (باگ
   * گزارش‌شده: «<b>سفارش … تحویل شد.</b>»). اینجا هم تگ حذف می‌شود و هم موجودیت‌های
   * HTML رمزگشایی می‌شوند تا متن گفتگو همان چیزی باشد که مشتری دیده است.
   */
  private static plainForPanel(text: string): string {
    return text
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div)>/gi, '\n')
      .replace(/<[^>]*>/g, '')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
      .replace(/&amp;/g, '&')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  /** ثبت پاسخ فروشگاه (بات یا فروشنده) در تاریخچهٔ گفتگو + رخداد زنده. */
  private async logOutbound(shopId: string, chatId: string, text: string, author: 'bot' | 'seller'): Promise<void> {
    try {
      const saved = await this.db.chatMessage.create({
        data: { shopId, chatId, direction: 'out', author, text: TelegramService.plainForPanel(text).slice(0, 4000) },
        select: { id: true },
      });
      this.realtime.emitShop(shopId, 'chat', { chatId, messageId: saved.id, author });
      this.realtime.emitAdmin('chat', { shopId, chatId });
    } catch (error) {
      this.logger.warn(`ثبت پاسخ فروشگاه ناموفق: ${error instanceof Error ? error.message : 'unknown'}`);
    }
  }

  /**
   * تأیید تحویل توسط مشتری.
   *
   * سفارش «ارسال‌شده» همان چت به «تحویل‌شده» می‌رود، به فروشنده اعلان می‌رسد و
   * مشتری یک پیام تشکر می‌گیرد. اگر سفارشی در وضعیت ارسال‌شده نباشد، `null`
   * برمی‌گردد تا مسیر پاسخ عادی ادامه پیدا کند (بات بی‌دلیل «تحویل شد» نمی‌گوید).
   */
  private async confirmDelivery(
    conversation: { id: string; shopId: string; firstName: string },
    chatId: string,
    text: string,
    quoted: { text: string; from: string } | null,
  ): Promise<HandleResult | null> {
    const order = await this.orders.confirmDeliveryByCustomer(conversation.shopId, chatId);
    if (!order) return null;

    await this.logInbound(conversation.shopId, chatId, text, quoted);
    const message = [
      `✅ <b>سفارش ${escapeHtml(order.code)} تحویل شد.</b>`,
      'ممنون که تحویلش را تأیید کردید 🌿',
      'اگر دوست داشتید، نظرتان درباره‌ی خرید را همین‌جا بنویسید تا بقیه هم ببینند.',
    ].join('\n');
    const sent = await this.send(chatId, message, undefined, 'HTML');
    // فقط پیام واقعاً ارسال‌شده در تاریخچه ثبت می‌شود؛ همان قاعده‌ای که در پاسخ
    // فروشنده هم رعایت شده تا پنل هیچ‌وقت پیامی را که مشتری ندیده نشان ندهد.
    if (sent) await this.logOutbound(conversation.shopId, chatId, message, 'bot');
    this.audit.record({
      action: 'telegram.delivery_confirmed', entity: 'order', entityId: order.id,
      shopId: conversation.shopId, meta: { code: order.code, chatId },
    });
    return { status: 'handled', replies: sent ? 1 : 0, kind: 'delivery_confirmed' };
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

  /** چند پیام آخر گفتگو، برای زمینه‌ی مدل زبانی. */
  private async recentMessages(shopId: string, chatId: string, take: number) {
    const rows = await this.db.chatMessage.findMany({
      where: { shopId, chatId },
      orderBy: { createdAt: 'desc' },
      take,
      select: { direction: true, text: true },
    });
    return rows.reverse().map(row => ({ direction: row.direction === 'in' ? 'in' as const : 'out' as const, text: row.text }));
  }

  // ------------------------------------------------------------- دکمه‌های inline
  private async handleCallback(callback: IncomingCallback): Promise<HandleResult> {
    const chatId = String(callback.message?.chat.id ?? callback.from.id);
    const data = callback.data ?? '';
    // بدون این، چرخ‌لودینگ دکمه در گوشی مشتری گیر می‌کند.
    await this.client.answerCallbackQuery(callback.id).catch(() => undefined);

    const conversation = await this.db.telegramConversation.findFirst({ where: { chatId, shop: { is: { active: true } } }, orderBy: { lastSeenAt: 'desc' } });
    if (!conversation) {
      await this.send(chatId, 'برای شروع، لینک اختصاصی فروشگاه را باز کنید.');
      return { status: 'handled', replies: 1, kind: 'no_conversation' };
    }
    await this.db.telegramConversation.update({ where: { id: conversation.id }, data: { lastSeenAt: new Date() } });

    // «اگر موجود شد خبرم کن»
    if (data.startsWith('watch:')) {
      const productId = data.slice(6);
      const product = await this.db.product.findFirst({
        where: { shopId: conversation.shopId, id: productId, active: true },
        select: { id: true, title: true, variants: { where: { active: true }, select: { stock: true, price: true } } },
      });
      if (!product) {
        await this.send(chatId, 'این محصول دیگر در کاتالوگ نیست.');
        return { status: 'handled', replies: 1, kind: 'watch_gone' };
      }
      const totalStock = product.variants.reduce((sum, variant) => sum + Math.max(variant.stock, 0), 0);
      if (totalStock > 0) {
        // بین کلیک و این لحظه موجود شده؛ همان‌جا خبر می‌دهیم.
        const reply = describeProduct(product as never, 'قیمت');
        const replies = (await this.sendWithButtons(chatId, reply.text, reply.buttons, reply.parseMode)) ? 1 : 0;
        return { status: 'handled', replies, kind: 'watch_already_in_stock' };
      }
      await this.db.stockAlert.upsert({
        where: { shopId_chatId_productId: { shopId: conversation.shopId, chatId, productId } },
        create: { shopId: conversation.shopId, productId, chatId, firstName: conversation.firstName },
        update: { notifiedAt: null },
      });
      this.audit.record({
        action: 'telegram.stock_watch', entity: 'product', entityId: productId,
        shopId: conversation.shopId, meta: { chatId, title: product.title },
      });
      const replies = (await this.send(chatId, `🔔 ثبت شد. به‌محض شارژ شدن «${product.title}» همین‌جا خبرتان می‌کنم.`)) ? 1 : 0;
      return { status: 'handled', replies, kind: 'stock_watch' };
    }

    // صفحه‌بندی فهرست محصولات: دکمه‌ی «بعدی»/«قبلی».
    // فهرست از روی همان پرسشی بازسازی می‌شود که صفحه‌ی قبلی را ساخته بود.
    if (data.startsWith('pg:')) {
      const page = Math.max(0, Number.parseInt(data.slice(3), 10) || 0);
      const state = (conversation.clarify ?? {}) as { listQuery?: string };
      const query = (state.listQuery ?? '').trim();
      const products = await this.catalog(conversation.shopId);
      const discovery = query ? discover(query, products) : ({ kind: 'none' } as const);
      const list = discovery.kind === 'many'
        ? discovery.products
        : discovery.kind === 'single'
          ? [discovery.product]
          : products;
      const reply = clarifyProducts(list, query || 'کاتالوگ فروشگاه', page);
      const replies = (await this.sendWithButtons(chatId, reply.text, reply.buttons, reply.parseMode)) ? 1 : 0;
      this.audit.record({ action: 'telegram.list_page', entity: 'conversation', entityId: conversation.id, shopId: conversation.shopId, meta: { page, query } });
      return { status: 'handled', replies, kind: 'list_page' };
    }

    // دکمه‌های «منظورتان کدام است؟»
    if (data.startsWith('cl:')) {
      const intent = data.slice(3) as IntentId;
      const shop = await this.db.shop.findUniqueOrThrow({
        where: { id: conversation.shopId },
        select: { id: true, shipping: true, payment: true, workingHours: true, returns: true, handoffMessage: true, name: true },
      });
      const products = await this.catalog(conversation.shopId);
      const answer = answerIntent(intent, shop as BrainShop, products);
      await this.db.telegramConversation.update({ where: { id: conversation.id }, data: { clarify: Prisma.DbNull } });
      if (!answer) {
        await this.send(chatId, 'این مورد را فروشنده بهتر می‌داند؛ پیامتان را برای ایشان می‌فرستم.');
        return { status: 'handled', replies: 1, kind: 'clarify_empty' };
      }
      const replies = (await this.sendWithButtons(chatId, answer.text, answer.buttons, answer.parseMode)) ? 1 : 0;
      this.audit.record({ action: 'telegram.clarify_pick', entity: 'conversation', entityId: conversation.id, shopId: conversation.shopId, meta: { intent } });
      return { status: 'handled', replies, kind: 'clarify_pick' };
    }

    // انتخاب محصول از لیست رفع ابهام
    if (data.startsWith('p:')) {
      const productId = data.slice(2);
      const product = (await this.catalog(conversation.shopId)).find(item => item.id === productId);
      if (!product) {
        await this.send(chatId, 'این محصول دیگر موجود نیست. کاتالوگ را دوباره ببینید: /help');
        return { status: 'handled', replies: 1, kind: 'product_gone' };
      }
      const reply = describeProduct(product, 'قیمت');
      const replies = (await this.sendWithButtons(chatId, reply.text, reply.buttons, reply.parseMode)) ? 1 : 0;
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
      const replies = (await this.sendWithButtons(chatId, prompt.text, prompt.buttons, prompt.parseMode)) ? 1 : 0;
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
    const sent = await this.sendWithButtons(conversation.chatId, outcome.reply.text, outcome.reply.buttons, outcome.reply.parseMode);
    return { status: 'handled', replies: sent ? 1 : 0, kind: outcome.kind === 'invalid' ? 'order_invalid' : 'order_step' };
  }

  /** ساخت سفارش + راهنمای کارت‌به‌کارت. موجودی همین‌جا رزرو می‌شود.
   * پرداخت مشتری نهایی همیشه کارت‌به‌کارت است؛ درگاه آنلاین فقط برای
   * فروش پلن/اعتبار به فروشنده است. فلو کامل رسید در فاز V2-3 می‌آید. */
  private async finishOrder(
    conversation: { id: string; shopId: string; chatId: string },
    draft: OrderDraft,
  ): Promise<HandleResult> {
    try {
      const order = await this.orders.create(conversation.shopId, {
        chatId: conversation.chatId,
        customerName: draft.name ?? '',
        customerPhone: draft.phone ?? '',
        address: fullAddress(draft),
        province: draft.province ?? '',
        city: draft.city ?? '',
        street: draft.street ?? '',
        alley: draft.alley ?? '',
        plaque: draft.plaque ?? '',
        unit: draft.unit ?? '',
        postalCode: draft.postalCode ?? '',
        items: [{ variantId: draft.variantId, quantity: draft.quantity ?? 1 }],
      });
      await this.db.telegramConversation.update({ where: { id: conversation.id }, data: { draft: Prisma.DbNull } });

      const methods = await this.paymentMethods.activeForCustomer(conversation.shopId);
      const cardLines = methods.length > 0
        ? methods.map(method => [
            `💳 کارت: <code>${method.masked}</code>`,
            `👤 به نام: ${escapeHtml(method.holderName)}`,
            method.bankName ? `🏦 ${escapeHtml(method.bankName)}` : '',
            method.instruction ? `📝 ${escapeHtml(method.instruction)}` : '',
          ].filter(Boolean).join('\n')).join('\n\n')
        : 'شماره کارت فروشگاه هنوز ثبت نشده است؛ فروشنده به‌زودی اطلاعات پرداخت را می‌فرستد.';

      const sent = await this.send(
        conversation.chatId,
        [
          '🧾 <b>سفارش شما ساخته شد</b>',
          '',
          `🆔 کد سفارش: <code>${order.code}</code>`,
          `🛍 ${escapeHtml(draftTitle(draft))}`,
          `🔢 ${(draft.quantity ?? 1).toLocaleString('fa-IR')} عدد`,
          `💰 مبلغ قابل پرداخت: <b>${order.total.toLocaleString('fa-IR')} تومان</b>`,
          `📍 ${escapeHtml(fullAddress(draft))}`,
          '',
          'برای تکمیل، مبلغ را کارت‌به‌کارت واریز کنید:',
          cardLines,
          '',
          'بعد از واریز، عکس رسید را همین‌جا بفرستید تا سفارش‌تان تأیید شود.',
          '<i>اگر پرداخت نکنید، تا ۲۴ ساعت دیگر لغو و موجودی آزاد می‌شود.</i>',
        ].join('\n'),
      );

      this.audit.record({
        action: 'telegram.order_created',
        entity: 'order',
        entityId: order.id,
        shopId: conversation.shopId,
        meta: { code: order.code, total: order.total, payment: 'card_to_card', chatId: conversation.chatId },
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
    const conversation = await this.db.telegramConversation.findFirst({ where: { chatId, shop: { is: { active: true } } }, orderBy: { lastSeenAt: 'desc' } });
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
      [OrderStatus.RECEIPT_RECEIVED]: 'رسید دریافت شد',
      [OrderStatus.NEEDS_REVIEW]: 'در حال بررسی رسید',
      [OrderStatus.PAID]: 'پرداخت‌شده',
      [OrderStatus.PREPARING]: 'در حال آماده‌سازی',
      [OrderStatus.SHIPPED]: 'ارسال‌شده',
      [OrderStatus.COMPLETED]: 'تحویل‌شده',
      [OrderStatus.CANCELLED]: 'لغوشده',
      [OrderStatus.EXPIRED]: 'منقضی‌شده',
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

  // ------------------------------------------------------- فروشنده → مشتری
  /**
   * چت‌هايی که فروشنده‌ی یک فروشگاه هستند.
   *
   * چرا لازم است: پیام‌های فروشنده نباید از مسیر «مشتری» رد شوند (وگرنه بات به
   * فروشنده هم پاسخ خودکار می‌داد)، و پاسخ او باید به همان مشتری برود.
   */
  private async ownerChannel(chatId: string) {
    return this.db.channel.findFirst({
      where: { ownerChat: chatId, active: true },
      select: { id: true, shopId: true, shop: { select: { name: true } } },
    });
  }

  /**
   * پیام فروشنده در چت خودش.
   *
   * سه راه برای پاسخ دادن، از آسان به سخت:
   *  ۱. **پاسخ (Reply) روی پیام اعلان**: متن نقل‌شده کد گفتگو را دارد → همان مشتری.
   *  ۲. `/reply <کد گفتگو> <متن>`: وقتی اعلان قدیمی است.
   *  ۳. `/chat <کد>`: دیدن آخرین پیام‌های آن گفتگو.
   */
  private async sellerMessage(
    channel: { id: string; shopId: string; shop: { name: string } },
    chatId: string,
    text: string,
    message: IncomingMessage,
  ): Promise<HandleResult> {
    const command = /^\/(reply|chat|help)(?:@\w+)?(?:\s+([\s\S]+))?$/u.exec(text);

    if (command?.[1] === 'help' || !text) {
      await this.send(chatId, [
        '👋 شما فروشنده‌ی این فروشگاه هستید؛ پیام‌های شما خودکار جواب نمی‌گیرند.',
        '',
        '<b>پاسخ به مشتری</b>',
        '• روی پیام اعلانِ بات «پاسخ» بزنید و متن را بنویسید.',
        '• یا: <code>/reply کد‌گفتگو متن</code>',
        '• دیدن گفتگو: <code>/chat کد‌گفتگو</code>',
        '',
        'کد گفتگو در پایین هر اعلان نوشته شده است.',
      ].join('\n'), undefined, 'HTML');
      return { status: 'handled', replies: 1, kind: 'seller_help' };
    }

    if (command?.[1] === 'chat') {
      const conversation = await this.resolveConversation(channel.shopId, command[2]?.trim() ?? '');
      if (!conversation) {
        await this.send(chatId, 'کد گفتگو پیدا نشد. کد را از پایین اعلان بات بردارید.');
        return { status: 'handled', replies: 1, kind: 'chat_not_found' };
      }
      const history = await this.db.chatMessage.findMany({
        where: { shopId: channel.shopId, chatId: conversation.chatId },
        orderBy: { createdAt: 'desc' },
        take: 10,
      });
      await this.send(chatId, history.length === 0
        ? 'هنوز پیامی در این گفتگو ثبت نشده است.'
        : `<b>گفتگو با ${conversation.firstName || 'مشتری'}</b>\n\n${history.reverse().map(item => `${item.direction === 'in' ? '👤 مشتری' : '🧑‍💼 شما'}: ${item.text.slice(0, 200)}`).join('\n')}`, undefined, 'HTML');
      return { status: 'handled', replies: 1, kind: 'chat_history' };
    }

    // ۱) پاسخ روی پیام اعلان
    let target: { chatId: string } | null = null;
    let body = text;

    const quoted = message.reply_to_message;
    if (quoted) {
      const code = TelegramService.conversationCodeFrom(quoted.text ?? quoted.caption ?? '');
      if (code) target = await this.resolveConversation(channel.shopId, code);
    }

    // ۲) /reply <code> <text>
    if (command?.[1] === 'reply') {
      const [rawCode, ...rest] = (command[2] ?? '').trim().split(/\s+/);
      body = rest.join(' ').trim();
      if (!rawCode || !body) {
        await this.send(chatId, 'شکل درست: <code>/reply کد‌گفتگو متن پیام</code>', undefined, 'HTML');
        return { status: 'handled', replies: 1, kind: 'reply_usage' };
      }
      target = await this.resolveConversation(channel.shopId, rawCode);
      if (!target) {
        await this.send(chatId, 'این کد گفتگو پیدا نشد یا مال فروشگاه شما نیست.');
        return { status: 'handled', replies: 1, kind: 'chat_not_found' };
      }
    }

    if (!target) {
      await this.send(chatId, [
        'برای پاسخ به مشتری، روی پیام اعلانِ بات «پاسخ» بزنید.',
        'اگر اعلان را پاک کرده‌اید: <code>/reply کد‌گفتگو متن</code>',
        'راهنما: /help',
      ].join('\n'), undefined, 'HTML');
      return { status: 'handled', replies: 1, kind: 'seller_hint' };
    }

    const delivered = await this.deliverSellerMessage(channel, target.chatId, body, chatId);
    return { status: 'handled', replies: delivered ? 1 : 0, kind: delivered ? 'seller_reply' : 'seller_reply_failed' };
  }

  /**
   * اطلاع‌دادن به مشتریانی که منتظر شارژ یک محصول بودند.
   *
   * از `CatalogService.changeStock` صدا زده می‌شود؛ یعنی هر مسیر افزایش موجودی
   * (شارژ دستی، اصلاح موجودی، بازگشت موجودی سفارش لغوشده) پوشش داده می‌شود.
   * متن پیام شامل قیمت واقعی همان لحظه و دکمه‌ی «دیدن محصول» است.
   */
  async notifyRestock(shopId: string, productId: string): Promise<number> {
    const alerts = await this.db.stockAlert.findMany({
      where: { shopId, productId, notifiedAt: null },
      take: 100,
      select: { id: true, chatId: true },
    });
    if (alerts.length === 0) return 0;

    const product = await this.db.product.findFirst({
      where: { shopId, id: productId },
      select: { id: true, title: true, variants: { where: { active: true }, select: { size: true, color: true, price: true, stock: true } } },
    });
    if (!product) return 0;

    const available = product.variants.filter(variant => variant.stock > 0);
    if (available.length === 0) return 0;

    const cheapest = [...available].sort((a, b) => a.price - b.price)[0];
    const specs = available
      .slice(0, 4)
      .map(variant => [variant.size ? `سایز ${variant.size}` : '', variant.color ? `رنگ ${variant.color}` : ''].filter(Boolean).join(' / ') || 'بدون سایز')
      .join('، ');
    const text = [
      `🎉 <b>${escapeHtml(product.title)}</b> دوباره موجود شد!`,
      `💰 از ${cheapest.price.toLocaleString('fa-IR')} تومان`,
      `📦 ${escapeHtml(specs)}`,
      '',
      'قبلاً خواسته بودید خبرتان کنم. تا تمام نشده سفارش را ثبت کنید.',
    ].join('\n');

    let sent = 0;
    for (const alert of alerts) {
      const ok = await this.sendWithButtons(alert.chatId, text, [[{ text: '🛍 دیدن و سفارش', data: `p:${product.id}` }]], 'HTML');
      if (ok) {
        sent += 1;
        await this.db.stockAlert.update({ where: { id: alert.id }, data: { notifiedAt: new Date() } });
      }
    }
    if (sent) {
      this.audit.record({
        action: 'telegram.restock_notified', entity: 'product', entityId: productId,
        shopId, meta: { notified: sent, waiting: alerts.length },
      });
    }
    return sent;
  }

  /**
   * ارسال پیام فروشنده به مشتری و ثبت آن در تاریخچه.
   * از پنل هم همین متد استفاده می‌شود تا رفتار یکسان باشد.
   */
  async deliverSellerMessage(
    channel: { shopId: string },
    customerChat: string,
    text: string,
    actorChat?: string,
    orderId?: string,
    reply?: { id?: string; text: string; from: 'in' | 'out' } | null,
  ): Promise<boolean> {
    const body = text.trim();
    if (!body) return false;
    // نقل‌قول: بالای پیام، همان چیزی که فروشنده به آن پاسخ داده است.
    // اگر فروشنده از داخل بات جواب می‌دهد (actorChat پر است) و ریپلای صریحی
    // نداده، به آخرین پیام مشتری نقل‌قول می‌زنیم تا مشتری بداند پاسخ به کدام
    // حرفش است.
    let quotedText = (reply?.text ?? '').trim();
    let quotedFrom = reply?.from ?? '';
    if (!quotedText && actorChat) {
      const lastIn = await this.db.chatMessage.findFirst({
        where: { shopId: channel.shopId, chatId: customerChat, direction: 'in' },
        orderBy: { createdAt: 'desc' },
        select: { id: true, text: true },
      });
      if (lastIn) {
        quotedText = lastIn.text;
        quotedFrom = 'in';
      }
    }
    const quote = quotedText
      ? `↩️ <i>${escapeHtml(quotedText.slice(0, 140))}</i>\n`
      : '';
    const sent = await this.send(customerChat, `💬 <b>پاسخ فروشنده</b>\n${quote}${body}`, undefined, 'HTML');
    if (sent) {
      await this.db.chatMessage.create({
        data: {
          shopId: channel.shopId, chatId: customerChat, direction: 'out', author: 'seller', text: body,
          orderId: orderId ?? null,
          replyToId: reply?.id ?? null,
          replyText: quotedText.slice(0, 300),
          replyFrom: quotedFrom,
        },
        select: { id: true },
      });
      this.realtime.emitShop(channel.shopId, 'chat', { chatId: customerChat, author: 'seller' });
      this.audit.record({
        action: 'telegram.seller_reply',
        entity: 'conversation',
        entityId: customerChat,
        shopId: channel.shopId,
        meta: { via: actorChat ? 'bot' : 'panel', chars: body.length, orderId: orderId ?? null },
      });
    }
    return sent;
  }

  /** کد گفتگو از متن اعلان: بالای هر اعلان `#گفتگو a1b2c3d4` می‌آید. */
  static conversationCodeFrom(text: string): string | null {
    return /گفتگو\s*[:#]?\s*([a-f0-9]{6,10})/iu.exec(text)?.[1] ?? null;
  }

  /** کد کوتاه گفتگو که در پیام‌ها نشان داده می‌شود. */
  static conversationCode(conversationId: string): string {
    return conversationId.replace(/-/g, '').slice(0, 8);
  }

  /**
   * پیدا کردن گفتگو با کد کوتاه یا شناسه‌ی کامل.
   * `startsWith` روی uuid امن است چون کد از ۸ کاراکتر شروع یک uuid یکتاست.
   */
  private async resolveConversation(shopId: string, code: string) {
    const clean = code.trim().toLowerCase().replace(/[^a-f0-9]/g, '');
    if (clean.length < 6) return null;
    // Prisma فیلتر startsWith روی ستون uuid نمی‌دهد، پس مقایسه‌ی متنی می‌کنیم.
    const rows = await this.db.$queryRaw<{ id: string; chatId: string; firstName: string; username: string }[]>`
      SELECT id::text AS id, "chatId", "firstName", username
      FROM "TelegramConversation"
      WHERE "shopId" = ${shopId}::uuid AND id::text LIKE ${`${clean.slice(0, 8)}%`}
      LIMIT 1
    `;
    return rows[0] ?? null;
  }

  // ---------------------------------------------------------------- اعلان فروشنده
  /**
   * اعلان به فروشنده.
   * `forceReply` برای پیام‌هایی است که احتمالاً جواب می‌خواهند (سؤال مشتری، سفارش):
   * تلگرام کادر پاسخ را خودش باز می‌کند و فروشنده فقط تایپ می‌کند.
   */
  async notifyOwner(shopId: string, text: string, forceReply = false): Promise<boolean> {
    const channel = await this.db.channel.findFirst({ where: { shopId, active: true }, select: { ownerChat: true } });
    // '' یعنی وصل‌نشده؛ بدون trim یک مقدار خالی به‌عنوان chatId به تلگرام می‌رفت.
    if (!channel?.ownerChat?.trim()) return false;
    return this.send(
      channel.ownerChat.trim(),
      text,
      forceReply ? { force_reply: true, input_field_placeholder: 'پاسخ به مشتری…' } : undefined,
    );
  }

  /** برای سفارش‌ها، پرداخت‌ها و پیام فروشنده: ارسال پیام ساده به یک چت. */
  async sendTo(chatId: string, text: string): Promise<boolean> {
    return this.send(chatId, text);
  }

  /**
   * ارسال با دکمه‌های inline. دکمه‌ها فقط به تکه‌ی آخر می‌چسبند؛ اگر پیام طولانی
   * شد، دکمه‌ی نصفه وسط پیام نمی‌آید.
   */
  private async sendWithButtons(chatId: string, text: string, buttons?: BotButton[][], parseMode?: 'HTML'): Promise<boolean> {
    if (!buttons?.length) return this.send(chatId, text, undefined, parseMode);
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
      const ok = await this.sendPart(chatId, part, parseMode, index === parts.length - 1 ? { inline_keyboard } : undefined);
      if (!ok) allOk = false;
    }
    return allOk;
  }

  /**
   * ارسال با تکه‌بندی؛ نتیجه فقط برای شمارش/لاگ است و هرگز throw نمی‌شود.
   * `replyMarkup` برای `force_reply` لازم است: فروشنده با «پاسخ» روی همان پیام،
   * مستقیم به مشتری جواب می‌دهد.
   */
  private async send(
    chatId: string,
    text: string,
    replyMarkup?: ReplyMarkup,
    parseMode?: 'HTML',
  ): Promise<boolean> {
    if (!this.client.configured) {
      this.logger.warn(`TELEGRAM_BOT_TOKEN ست نشده؛ پیام به ${chatId} ارسال نشد.`);
      return false;
    }
    let allOk = true;
    const parts = splitMessage(text);
    for (const [index, part] of parts.entries()) {
      const result = await this.sendPart(chatId, part, parseMode, index === parts.length - 1 ? replyMarkup : undefined);
      if (!result) allOk = false;
    }
    return allOk;
  }

  /**
   * ارسال یک تکه با محافظِ قالب‌بندی.
   *
   * سه لایه‌ی محافظ، چون نمایش تگ خام برای مشتری بدتر از نبودِ بولد است:
   *  ۱. اگر متن تگ HTML دارد و `parseMode` داده نشده، خودمان HTML می‌فرستیم
   *     (تا هرگز `<b>` به‌صورت متن دیده نشود).
   *  ۲. اگر تلگرام تگ را نامعتبر بداند (`can't parse entities`)، همان متن بدون
   *     تگ فرستاده می‌شود؛ مشتری پیام خوانا می‌بیند، نه تگ خام.
   *  ۳. هر خطای دیگر فقط لاگ می‌شود.
   */
  /**
   * حالت متنِ خروجی.
   *
   * اگر متن تگ HTML دارد، همان لحظه HTML اعلام می‌شود — حتی اگر لایه‌ی بالاتر
   * فراموش کرده باشد. ریشه‌ی باگ «مشتری تگ‌های `<b>` را می‌دید» همین بود:
   * پاسخ قاعده‌محور تگ داشت ولی parse_mode همراهش نبود.
   */
  static parseModeOf(text: string, explicit?: 'HTML'): 'HTML' | undefined {
    if (explicit) return explicit;
    return /<(b|i|u|s|code|pre|a)[\s>]/i.test(text) ? 'HTML' : undefined;
  }

  private async sendPart(chatId: string, text: string, parseMode?: 'HTML', replyMarkup?: ReplyMarkup): Promise<boolean> {
    const mode = TelegramService.parseModeOf(text, parseMode);
    const body = { chat_id: chatId, text, ...(mode ? { parse_mode: mode } : {}) };

    let result = await this.client.sendMessage({
      ...body,
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    });

    const unparsable = !result.ok && /can't parse entities|unsupported start tag|can't find end tag/i.test(result.description ?? '');
    if (unparsable) {
      this.logger.warn(`قالب‌بندی پیام برای ${chatId} پذیرفته نشد؛ نسخه‌ی بدون تگ فرستاده شد.`);
      result = await this.client.sendMessage({
        chat_id: chatId,
        text: TelegramService.stripTags(text),
        ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      });
    }

    if (!result.ok) {
      this.logger.warn(`sendMessage به ${chatId} ناموفق: ${result.error}${result.description ? ` (${result.description})` : ''}`);
      return false;
    }
    return true;
  }

  /** حذف تگ‌های قالب‌بندی تلگرام و برگرداندن متن قابل‌خواندن. */
  static stripTags(text: string): string {
    return text
      .replace(/<\/?(b|i|u|s|code|pre)>/gi, '')
      .replace(/<a\s+href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '$2 ($1)')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');
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
