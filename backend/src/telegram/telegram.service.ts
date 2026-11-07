import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../logging/audit.service';
import { answerFresh, type FreshProduct, type FreshShop } from '../fresh/fresh';
import { readTelegramConfig, splitMessage, TelegramClient } from './telegram.client';

export type IncomingUpdate = {
  update_id: number;
  message?: {
    message_id: number;
    date: number;
    text?: string;
    chat: { id: number | string; type?: string; username?: string; first_name?: string };
    from?: { id: number | string; is_bot?: boolean; username?: string; first_name?: string };
  };
  edited_message?: unknown;
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

  constructor(private readonly db: PrismaService, private readonly audit: AuditService) {}

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

    const message = update.message;
    // پیام ویرایش‌شده، استیکر، عکس و … فعلاً پاسخ نمی‌گیرند
    if (!message?.text || !message.chat) return { status: 'ignored', reason: 'unsupported_type' };
    if (message.from?.is_bot) return { status: 'ignored', reason: 'from_bot' };

    const chatId = String(message.chat.id);
    const text = message.text.trim();

    const command = /^\/(start|help|link|stop)(?:@\w+)?(?:\s+(.+))?$/u.exec(text);
    if (command?.[1] === 'start') return this.start(chatId, message, command[2]?.trim() ?? '');
    if (command?.[1] === 'link') return this.linkOwner(chatId, message, command[2]?.trim() ?? '');
    if (command?.[1] === 'stop') return this.stop(chatId);
    if (command?.[1] === 'help') return this.help(chatId);

    if (text.startsWith('/')) return { status: 'ignored', reason: 'unknown_command' };

    return this.customerMessage(chatId, text);
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
      'سؤال‌هایی که می‌توانم جواب بدهم:',
      '• قیمت یک محصول',
      '• موجود بودن یک محصول',
      '• شرایط ارسال و پرداخت',
      '• ساعت کاری فروشگاه',
      '',
      'برای موارد دیگر به فروشنده وصلتان می‌کنم.',
    ].join('\n'));
    return { status: 'handled', replies: 1, kind: 'help' };
  }

  // ---------------------------------------------------------------- مشتری
  private async customerMessage(chatId: string, text: string): Promise<HandleResult> {
    const conversation = await this.db.telegramConversation.findFirst({ where: { chatId }, orderBy: { lastSeenAt: 'desc' } });
    if (!conversation) {
      await this.send(chatId, 'برای شروع، لینک اختصاصی فروشگاه را باز کنید.');
      return { status: 'handled', replies: 1, kind: 'no_conversation' };
    }

    const [shop, products] = await Promise.all([
      this.db.shop.findUniqueOrThrow({ where: { id: conversation.shopId }, select: { shipping: true, payment: true, workingHours: true, handoffMessage: true, name: true } }),
      this.db.product.findMany({
        where: { shopId: conversation.shopId, active: true },
        take: 501,
        select: { title: true, variants: { where: { active: true }, take: 2, select: { size: true, color: true, price: true, stock: true } } },
      }),
    ]);

    const answer = products.length > 500
      ? { kind: 'handoff' as const, text: shop.handoffMessage.trim() || 'برای پاسخ دقیق‌تر با فروشنده هماهنگ می‌کنم.' }
      : answerFresh(text, shop as FreshShop, products as FreshProduct[]);

    await this.db.telegramConversation.update({
      where: { id: conversation.id },
      data: { messageCount: { increment: 1 }, lastSeenAt: new Date() },
    });

    let replies = 0;
    if (await this.send(chatId, answer.text)) replies += 1;

    if (answer.kind === 'handoff') {
      // ارجاع به فروشنده: هم به مشتری گفتیم، هم فروشنده باید خبردار شود
      const notified = await this.notifyOwner(conversation.shopId, [
        `🔔 سؤال نیازمند پاسخ انسانی در «${shop.name}»`,
        `از: ${conversation.firstName || 'مشتری'}${conversation.username ? ` (@${conversation.username})` : ''}`,
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
      meta: { kind: answer.kind, chars: text.length, handoffNotified: answer.kind === 'handoff' },
    });
    return { status: 'handled', replies, kind: answer.kind };
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
}
