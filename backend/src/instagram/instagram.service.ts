import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { AuditService } from '../logging/audit.service';
import { AiService } from '../ai/ai.service';
import { OrdersService } from '../orders/orders.service';
import { PaymentsService } from '../payments/payments.service';
import { TelegramService } from '../telegram/telegram.service';
import { discover, type CatalogProduct } from '../catalog/discovery';
import {
  answerIntent,
  clarifyProducts,
  composeReply,
  describeProduct,
  type BotReply,
  type BotButton,
  type BrainShop,
} from '../telegram/brain';
import { addPersonality, resolveReply, type UnderstandResult } from '../ai/understand';
import type { IntentId } from '../telegram/understanding';
import {
  applyInput,
  draftTitle,
  fullAddress,
  promptFor,
  startDraft,
  type OrderDraft,
} from '../telegram/order-flow';
import { helpText, welcomeText, KEYBOARD_ACTIONS } from '../telegram/menu';
import { isDeliveryConfirmation } from '../telegram/delivery';
import { InstagramClient } from './instagram.client';
import { instagramConfigured, readInstagramConfig, webhookUrl, type InstagramConfig } from './instagram.config';
import { splitInstagramMessage, toInstagramActions, toPlainText } from './format';

/**
 * webhook باکس‌ای‌پی؛ فقط فیلدهایی که استفاده می‌کنیم.
 *
 * قرارداد (docs/instagram/dm/webhook): بدنه یک آبجکت با `event_id`،
 * `event_type`، `account_id` و `data` است. `data.messaging` می‌تواند آرایه یا
 * یک آبجکت باشد؛ هر دو حالت را می‌خوانیم چون در نمونه‌های مستندات هر دو دیده
 * می‌شود و رد کردن یکی یعنی «پیام مشتری گم شد».
 */
export type InstagramWebhook = {
  event_id?: string;
  event_type?: string;
  account_id?: string;
  data?: unknown;
};

type InstagramMessaging = {
  sender?: { id?: string; name?: string; username?: string };
  recipient?: { id?: string };
  timestamp?: number;
  message?: {
    mid?: string;
    text?: string;
    is_echo?: boolean;
    quick_reply?: { payload?: string };
    attachments?: unknown[];
  };
  postback?: { title?: string; payload?: string; mid?: string };
  reaction?: { action?: string; emoji?: string };
};

type InstagramComment = {
  id?: string;
  comment_id?: string;
  text?: string;
  sender?: { id?: string; username?: string };
  media?: { id?: string };
};

export type InstagramHandleResult =
  | { status: 'ignored'; reason: string }
  | { status: 'duplicate' }
  | { status: 'handled'; replies: number; kind?: string };

/** کوچک‌ترین چیزی که برای ارسال/ثبت پیام لازم است. */
type ChatTarget = { id: string; shopId: string; chatId: string };

/** پویش گفتگو؛ همان شکلی که بقیه‌ی سرویس‌ها انتظار دارند. */
type Conversation = ChatTarget & {
  id: string;
  shopId: string;
  chatId: string;
  firstName: string;
  username: string;
  draft: unknown;
  clarify: unknown;
};

/**
 * کانال اینستاگرام (دایرکت) روی BoxAPI.
 *
 * چرا یک سرویس جدا و نه افزودن به `TelegramService`: مسیر تلگرام ۱۳۰۰ خط است و
 * دست‌زدن به آن یعنی ریسک برای چیزهایی که امروز کار می‌کنند (سفارش، پرداخت،
 * پاسخ فروشنده). اینجا **فقط مغز مشترک** را صدا می‌زنیم — `composeReply`،
 * `resolveReply`، `clarifyProducts`، مرحله‌های سفارش — تا پاسخ اینستاگرام و
 * تلگرام از یک منبع بیاید. آنچه مخصوص تلگرام است (کیبورد، HTML، پست فوروارد)
 * اینجا معنی ندارد.
 *
 * نکته‌ی مهم درباره‌ی تاریخچه: گفتگوی اینستاگرام در همان جدول
 * `TelegramConversation`/`ChatMessage` ذخیره می‌شود، با `chatId = "ig:<igsid>"`.
 * دلیلش این است که پنل «گفتگوها و مشتریان» — و مسیر پاسخ فروشنده — از قبل روی
 * همین جدول‌ها کار می‌کند؛ پس فروشنده پیام اینستاگرام را هم در همان صندوق
 * ورودی می‌بیند، نه در یک صفحه‌ی جدا.
 */
@Injectable()
export class InstagramService {
  private readonly logger = new Logger('Instagram');
  private readonly config: InstagramConfig;
  private readonly client: InstagramClient;

  constructor(
    private readonly db: PrismaService,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
    private readonly ai: AiService,
    private readonly orders: OrdersService,
    private readonly payments: PaymentsService,
    private readonly telegram: TelegramService,
  ) {
    this.config = readInstagramConfig();
    this.client = new InstagramClient(this.config);
  }

  get configured(): boolean {
    return instagramConfigured(this.config);
  }

  /** پیشوند شناسه‌ی گفتگو در دیتابیس؛ پنل از همین برای تفکیک کانال استفاده می‌کند. */
  static readonly CHAT_PREFIX = 'ig:';

  static isInstagramChat(chatId: string): boolean {
    return chatId.startsWith(InstagramService.CHAT_PREFIX);
  }

  /** `ig:17841...` ← `17841...` */
  static recipientOf(chatId: string): string {
    return chatId.startsWith(InstagramService.CHAT_PREFIX)
      ? chatId.slice(InstagramService.CHAT_PREFIX.length)
      : chatId;
  }

  /**
   * وضعیت اتصال برای پنل.
   *
   * توکن و سکرت **هرگز** برنمی‌گردند؛ فقط «ست شده یا نه» و چند کارت آماری.
   * حتی مدیر پلتفرم هم از این مسیر مقدار خام را نمی‌بیند (فقط env).
   */
  async status(shopId: string) {
    const channel = await this.db.channel.findFirst({
      where: { shopId },
      select: { instagramAccountId: true, instagramUsername: true, instagramLinkedAt: true },
    });
    const [messages, conversations, lastEvent] = await Promise.all([
      this.db.chatMessage.count({ where: { shopId, chatId: { startsWith: InstagramService.CHAT_PREFIX } } }),
      this.db.telegramConversation.count({ where: { shopId, chatId: { startsWith: InstagramService.CHAT_PREFIX } } }),
      this.db.auditLog.findFirst({
        where: { shopId, action: { startsWith: 'instagram.' } },
        orderBy: { createdAt: 'desc' },
        select: { action: true, createdAt: true },
      }),
    ]);

    const linkedAccount = channel?.instagramAccountId ?? '';
    return {
      configured: this.configured,
      // ماسک‌شده؛ شناسه حساب برای پشتیبانی لازم است ولی محرمانه نیست.
      accountId: mask(this.config.accountId),
      accountLinked: Boolean(linkedAccount),
      accountMatchesEnv: Boolean(linkedAccount) && linkedAccount === this.config.accountId,
      username: channel?.instagramUsername ?? '',
      linkedAt: channel?.instagramLinkedAt?.toISOString() ?? null,
      loginUrl: this.config.loginUrl,
      webhookUrl: webhookUrl(this.config),
      webhookUrlIsHttps: webhookUrl(this.config).startsWith('https://'),
      signatureEnforced: this.config.webhookSecret.length > 0,
      apiBase: this.config.baseUrl,
      stats: { messages, conversations, lastEventAt: lastEvent?.createdAt.toISOString() ?? null, lastEventAction: lastEvent?.action ?? '' },
    };
  }

  /**
   * ارسال پیام آزمایشی به یک شناسه‌ی گیرنده.
   *
   * چرا لازم است: فروشنده بعد از اتصال راهی ندارد بفهمد «واقعاً وصل شده یا نه».
   * شناسه‌ی گیرنده (IGSID) را فقط از گفتگوهای همان پیج می‌شود گرفت؛ پس پنل
   * توضیح می‌دهد که اول از خود پیج یک پیام بفرستید.
   */
  async sendTest(shopId: string, recipientId: string) {
    if (!this.configured) return { ok: false as const, error: 'اتصال اینستاگرام هنوز کامل نیست.' };
    const target = recipientId.trim();
    if (!/^\d{5,32}$/.test(target)) return { ok: false as const, error: 'شناسه‌ی گیرنده باید عددی باشد (IGSID).' };

    const result = await this.client.sendMessage({
      recipientId: target,
      message: 'پیام آزمایشی از فروش‌یار — اتصال اینستاگرام درست کار می‌کند ✅',
    });
    this.audit.record({
      action: result.ok ? 'instagram.test_sent' : 'instagram.test_failed',
      entity: 'shop', entityId: shopId, shopId,
      meta: { recipientId: target, error: result.ok ? null : result.error },
    });
    return result.ok
      ? { ok: true as const, message: 'پیام آزمایشی ارسال شد.' }
      : { ok: false as const, error: `ارسال نشد: ${result.error}` };
  }

  // ------------------------------------------------------------- ورودی webhook
  /**
   * پردازش یک رویداد webhook.
   *
   * کنترلر بعد از بررسی امضا این را صدا می‌زند. `event_id` اتمیک قفل می‌شود؛
   * BoxAPI تا ۳ بار در ۶۰ ثانیه دوباره می‌فرستد و بدون این قفل، مشتری جواب
   * تکراری می‌گرفت.
   */
  async handleWebhook(payload: InstagramWebhook): Promise<InstagramHandleResult> {
    if (!this.configured) {
      this.audit.record({ action: 'instagram.not_configured', entity: 'webhook', meta: { eventType: payload.event_type ?? null } });
      return { status: 'ignored', reason: 'not_configured' };
    }

    const eventId = (payload.event_id ?? '').trim();
    if (eventId) {
      try {
        await this.db.instagramEvent.create({ data: { eventId: eventId.slice(0, 200), eventType: (payload.event_type ?? '').slice(0, 60) } });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return { status: 'duplicate' };
        this.logger.error(`ثبت رویداد ${eventId} ناموفق: ${error instanceof Error ? error.message : 'unknown'}`);
        return { status: 'ignored', reason: 'persist_failed' };
      }
    }

    const accountId = (payload.account_id ?? '').trim();
    const shopId = await this.resolveShop(accountId);
    if (!shopId) {
      this.audit.record({ action: 'instagram.unrouted', entity: 'webhook', meta: { accountId: mask(accountId), eventType: payload.event_type ?? null } });
      return { status: 'ignored', reason: 'unrouted_account' };
    }

    const type = (payload.event_type ?? '').trim();
    if (type === 'messaging' || type === 'messaging_postbacks') {
      const items = asArray<InstagramMessaging>(extract(payload.data, 'messaging'));
      let replies = 0;
      let handled = 0;
      let lastKind: string | undefined;
      let lastIgnored = '';
      for (const item of items) {
        const result = await this.handleMessaging(shopId, item).catch(error => {
          this.logger.error(`پردازش پیام اینستاگرام ناموفق: ${error instanceof Error ? error.message : 'unknown'}`);
          return { status: 'ignored', reason: 'handler_error' } as InstagramHandleResult;
        });
        if (result.status === 'handled') {
          handled += 1;
          replies += result.replies;
          lastKind = result.kind;
        } else if (result.status === 'ignored') {
          lastIgnored = result.reason;
        }
      }
      // اگر هیچ پیامی پردازش نشد (مثلاً همه اکوی خود پیج بودند) وضعیت را
      // «handled» گزارش نکنیم؛ وگرنه لاگ می‌گوید کار انجام شد و کسی دنبال علت
      // «پاسخی نیامد» نمی‌رود.
      if (handled === 0) return { status: 'ignored', reason: lastIgnored || 'no_messaging' };
      return { status: 'handled', replies, kind: lastKind ?? type };
    }

    if (type === 'comments') {
      const items = asArray<InstagramComment>(extract(payload.data, 'comments'));
      for (const item of items) await this.handleComment(shopId, item).catch(() => undefined);
      return { status: 'handled', replies: items.length, kind: 'comments' };
    }

    // mention/action.* را می‌خوانیم و فقط ثبت می‌کنیم؛ پاسخ خودکار به mention
    // بدون درخواست صریح فروشنده، اسپم محسوب می‌شود.
    this.audit.record({ action: 'instagram.event_ignored', entity: 'webhook', shopId, meta: { eventType: type || 'unknown' } });
    return { status: 'ignored', reason: 'unsupported_event' };
  }

  /** کدام فروشگاه صاحب این حساب است. */
  private async resolveShop(accountId: string): Promise<string | null> {
    if (!accountId) return null;
    const channel = await this.db.channel.findUnique({
      where: { instagramAccountId: accountId },
      select: { shopId: true, active: true },
    });
    if (channel?.active) return channel.shopId;

    // ثبت خودکار: اگر حساب دیگری در پلن رایگان به این فروشگاه وصل نیست، همین
    // حساب را به فروشگاه پیش‌فرض (INSTAGRAM_SHOP_CODE) وصل می‌کنیم. بدون این،
    // اولین پیام بعد از نصب به «حساب ناشناس» می‌خورد و کاربر فکر می‌کند خراب است.
    const shopId = await this.defaultShopId();
    if (!shopId) return null;
    const taken = await this.db.channel.findFirst({ where: { shopId }, select: { instagramAccountId: true } });
    if (taken?.instagramAccountId && taken.instagramAccountId !== accountId) return null;
    // `upsert` و نه `updateMany`: فروشگاهی که هنوز کانال تلگرام نساخته ردیف
    // `Channel` ندارد و `updateMany` بی‌صدا هیچ کاری نمی‌کرد؛ نتیجه این بود که
    // حساب هرگز ذخیره نمی‌شد و پنل همیشه «وصل نشده» نشان می‌داد.
    await this.db.channel.upsert({
      where: { shopId },
      create: {
        shopId,
        code: TelegramService.generateCode(),
        instagramAccountId: accountId,
        instagramLinkedAt: new Date(),
      },
      update: { instagramAccountId: accountId, instagramLinkedAt: new Date() },
    });
    this.audit.record({ action: 'instagram.account_linked', entity: 'shop', entityId: shopId, shopId, meta: { accountId: mask(accountId) } });
    return shopId;
  }

  /** فروشگاه پیش‌فرض برای حالت تک‌فروشگاهی (پلن رایگان). */
  private async defaultShopId(): Promise<string | null> {
    if (this.config.shopCode) {
      const channel = await this.db.channel.findUnique({ where: { code: this.config.shopCode }, select: { shopId: true } });
      if (channel) return channel.shopId;
    }
    // اگر فقط یک فروشگاه وجود دارد، ابهامی نیست.
    const shops = await this.db.shop.findMany({ take: 2, select: { id: true } });
    return shops.length === 1 ? shops[0].id : null;
  }

  // ------------------------------------------------------------------- دایرکت
  private async handleMessaging(shopId: string, item: InstagramMessaging): Promise<InstagramHandleResult> {
    const senderId = (item.sender?.id ?? '').trim();
    if (!senderId) return { status: 'ignored', reason: 'no_sender' };
    // اکوی پیام خودمان/فروشنده: اگر دوباره پردازش شود، بات به خودش جواب می‌دهد.
    if (item.message?.is_echo) return { status: 'ignored', reason: 'echo' };
    if (item.sender?.id && item.sender.id === this.config.accountId) return { status: 'ignored', reason: 'self' };

    const chatId = `${InstagramService.CHAT_PREFIX}${senderId}`;
    const conversation = await this.conversation(shopId, chatId, item.sender?.name ?? item.sender?.username ?? '');

    const payload = item.postback?.payload ?? item.message?.quick_reply?.payload ?? '';
    if (payload) return this.handlePayload(conversation, payload);

    const text = (item.message?.text ?? item.postback?.title ?? '').trim();

    // پیوست بدون متن (عکس/ویدیو/استوری ریپلای) — مغز بات فقط متن می‌خواند،
    // پس صادقانه می‌گوییم چه چیزی دیدیم، به‌جای سکوت.
    if (!text) {
      if (item.message?.attachments?.length) {
        const sent = await this.send(conversation, '🙏 عکس‌تان رسید. برای اینکه دقیق راهنمایی کنم، نام یا کد محصول را بنویسید.');
        return { status: 'handled', replies: sent ? 1 : 0, kind: 'attachment' };
      }
      return { status: 'ignored', reason: 'unsupported_type' };
    }

    return this.customerMessage(conversation, text);
  }

  /** گفتگو را می‌سازد/به‌روز می‌کند؛ `chatId` یکتاست. */
  private async conversation(shopId: string, chatId: string, name: string): Promise<Conversation> {
    const displayName = name.trim().slice(0, 80);
    const row = await this.db.telegramConversation.upsert({
      where: { shopId_chatId: { shopId, chatId } },
      create: { shopId, chatId, firstName: displayName },
      update: {
        lastSeenAt: new Date(),
        messageCount: { increment: 1 },
        ...(displayName ? { firstName: displayName } : {}),
      },
      select: { id: true, shopId: true, chatId: true, firstName: true, username: true, draft: true, clarify: true },
    });
    return row;
  }

  /**
   * همان مسیر مشتری در تلگرام: سفارش نیمه‌کاره → تأیید تحویل → مغز قاعده‌محور →
   * مدل زبانی (با سقف زمانی) → دستیار فروشنده.
   */
  private async customerMessage(conversation: Conversation, rawText: string): Promise<InstagramHandleResult> {
    const shop = await this.shop(conversation.shopId);

    const command = /^\/(start|help|products|orders|stop)\b/u.exec(rawText);
    if (command) return this.command(conversation, shop, command[1]);

    // ۱) وسط سفارش: ورودی فقط جواب همان مرحله است.
    const draft = TelegramService.readDraft(conversation.draft);
    if (draft) {
      const escape = draft.step !== 'confirm' && /^(قیمت|موجودی|ارسال|ساعت)\b/u.test(rawText);
      if (escape) await this.clearDraft(conversation.id);
      else return this.continueOrder(conversation, draft, { text: rawText });
    }

    // ۲) «تحویل گرفتم» قبل از هر قاعده‌ای؛ وگرنه به «ارسال و تحویل» می‌چسبد.
    if (isDeliveryConfirmation(rawText)) {
      const confirmed = await this.confirmDelivery(conversation, rawText);
      if (confirmed) return confirmed;
    }

    const products = await this.catalog(conversation.shopId);
    const round = TelegramService.clarifyRound(conversation.clarify);
    let reply: BotReply = composeReply(rawText, shop, products, { round });

    // ۳) مدل زبانی فقط وقتی قاعده‌ها مطمئن نیستند؛ با بودجه‌ی زمانی تا پاسخ
    //    مشتری پشت یک مدل کند گیر نکند (همان قاعده‌ی تلگرام).
    if (this.ai.enabled && reply.kind !== 'order') {
      const budget = Number(process.env.AI_REPLY_BUDGET_MS ?? 4000);
      const history = await this.recentMessages(conversation.shopId, conversation.chatId, 8);
      const resolved = await withBudget(
        resolveReply({ ai: this.ai, shop, products, text: rawText, rule: reply, history }),
        budget,
        { ...reply, source: 'rules' } as UnderstandResult,
      );
      const understood = resolved.kind === 'order' || resolved.kind === 'handoff'
        ? resolved
        : await withBudget(
          addPersonality(this.ai, shop, resolved, rawText),
          Math.max(1200, budget - 2500),
          resolved,
        );
      if (understood.source !== 'rules') {
        reply = {
          kind: understood.kind,
          reason: understood.reason,
          text: understood.text,
          buttons: understood.buttons,
          parseMode: understood.parseMode ?? reply.parseMode,
        };
        this.audit.record({
          action: understood.source === 'ai_match' ? 'instagram.ai_match'
            : understood.source === 'ai_polished' ? 'instagram.ai_polished' : 'instagram.ai_answer',
          entity: 'conversation', entityId: conversation.id, shopId: conversation.shopId,
          meta: { model: this.ai.model, query: rawText.slice(0, 120) },
        });
      }
    }

    const unclear = reply.kind === 'clarify' && (reply.reason ?? '').startsWith('unclear');
    const clarifyState = unclear
      ? { round: round + 1, last: rawText.slice(0, 200) }
      : reply.listQuery
        ? { round: 0, listQuery: reply.listQuery }
        : null;
    await this.db.telegramConversation.update({
      where: { id: conversation.id },
      data: { clarify: clarifyState ?? Prisma.DbNull },
    });

    // «سفارش» بدون نام محصول: کاتالوگ، بدون حدس.
    if (reply.kind === 'handoff' && /^(سفارش|خرید|سفارش بدم|می‌خوام سفارش بدم)$/u.test(rawText.trim()) && products.length > 0) {
      const catalog = clarifyProducts(products, 'محصولات فروشگاه', 0);
      await this.logInbound(conversation, rawText);
      const sent = await this.send(conversation, catalog.text, catalog.buttons);
      if (sent) await this.logOutbound(conversation, toPlainText(catalog.text), 'bot');
      return { status: 'handled', replies: sent ? 1 : 0, kind: 'catalog' };
    }

    await this.logInbound(conversation, rawText);
    const sent = await this.send(conversation, reply.text, reply.buttons);
    // در تاریخچه همان چیزی ثبت می‌شود که مشتری **دید** — یعنی متن بدون تگ.
    // اگر HTML مغز بات را ذخیره کنیم، پنل تگ‌های <b>/<code> را عیناً نشان می‌داد.
    if (sent) await this.logOutbound(conversation, toPlainText(reply.text), 'bot');

    if (reply.kind === 'handoff') {
      const transcript = await this.recentTranscript(conversation, 6);
      await this.telegram.notifyOwner(conversation.shopId, [
        `🔔 <b>سؤال نیازمند پاسخ انسانی</b> — از دایرکت اینستاگرام`,
        `از: ${escapeHtml(conversation.firstName || 'مشتری اینستاگرام')}`,
        '',
        escapeHtml(rawText),
        ...(transcript.length ? ['', '<b>چند پیام آخر:</b>', ...transcript.map(line => `<i>${escapeHtml(line)}</i>`)] : []),
        '',
        '↩️ پاسخ را در پنل، بخش «گفتگوها» بدهید؛ همان‌جا با دایرکت می‌رود.',
        `#گفتگو ${TelegramService.conversationCode(conversation.id)}`,
      ].join('\n'), true).catch(() => false);
    }

    this.audit.record({
      action: 'instagram.message',
      entity: 'conversation', entityId: conversation.id, shopId: conversation.shopId,
      meta: { kind: reply.kind, reason: reply.reason ?? null, chars: rawText.length },
    });
    return { status: 'handled', replies: sent ? 1 : 0, kind: reply.kind };
  }

  private async command(conversation: Conversation, shop: BrainShop, name: string): Promise<InstagramHandleResult> {
    if (name === 'start') {
      const capabilities = [shop.shipping, shop.payment, shop.workingHours, shop.returns ?? ''].filter(item => item.trim()).length > 0
        ? ['قیمت و موجودی', 'ثبت سفارش', 'ارسال', 'پرداخت']
        : [];
      const text = welcomeText({ name: shop.name, capabilities });
      const sent = await this.send(conversation, text, [[
        { text: KEYBOARD_ACTIONS.catalog, data: 'catalog' },
        { text: KEYBOARD_ACTIONS.shipping, data: 'cl:shipping' },
      ]]);
      return { status: 'handled', replies: sent ? 1 : 0, kind: 'welcome' };
    }
    if (name === 'help') {
      const sent = await this.send(conversation, helpText(shop as never));
      return { status: 'handled', replies: sent ? 1 : 0, kind: 'help' };
    }
    if (name === 'products') {
      const products = await this.catalog(conversation.shopId);
      const reply: BotReply = products.length
        ? clarifyProducts(products, 'کاتالوگ فروشگاه', 0)
        : { kind: 'answer', text: 'فهرست محصولات هنوز خالی است؛ فروشنده به‌زودی اضافه می‌کند.' };
      const sent = await this.send(conversation, reply.text, reply.buttons);
      return { status: 'handled', replies: sent ? 1 : 0, kind: 'catalog' };
    }
    if (name === 'orders') {
      const orders = await this.db.order.findMany({
        where: { shopId: conversation.shopId, chatId: conversation.chatId },
        orderBy: { createdAt: 'desc' }, take: 5,
        select: { code: true, status: true, total: true },
      });
      const text = orders.length
        ? ['🧾 <b>سفارش‌های شما</b>', '', ...orders.map(order => `${order.code} · ${statusLabel(order.status)} · ${order.total.toLocaleString('fa-IR')} تومان`)].join('\n')
        : 'سفارشی با این حساب ثبت نشده است.';
      const sent = await this.send(conversation, text);
      return { status: 'handled', replies: sent ? 1 : 0, kind: 'my_orders' };
    }
    const sent = await this.send(conversation, 'گفتگو بسته شد. هر وقت خواستید دوباره پیام بدهید 🌿');
    return { status: 'handled', replies: sent ? 1 : 0, kind: 'stop' };
  }

  // ------------------------------------------------------------- دکمه‌ها
  /**
   * دکمه‌های بات در اینستاگرام به‌صورت postback برمی‌گردند. همان پیشوندهایی که
   * تلگرام استفاده می‌کند (`p:`، `ord:`، `flow:`، `cl:`، `pg:`، `watch:`) اینجا
   * هم کار می‌کنند تا دو کانال یک مغز داشته باشند.
   */
  private async handlePayload(conversation: Conversation, rawPayload: string): Promise<InstagramHandleResult> {
    const payload = rawPayload.trim();
    if (payload.startsWith('url:')) {
      const sent = await this.send(conversation, `🔗 ${payload.slice(4)}`);
      return { status: 'handled', replies: sent ? 1 : 0, kind: 'url' };
    }

    if (payload === 'catalog') return this.command(conversation, await this.shop(conversation.shopId), 'products');

    if (payload.startsWith('cl:')) {
      const intent = payload.slice(3) as IntentId;
      const shop = await this.shop(conversation.shopId);
      const products = await this.catalog(conversation.shopId);
      const answer = answerIntent(intent, shop, products);
      await this.db.telegramConversation.update({ where: { id: conversation.id }, data: { clarify: Prisma.DbNull } });
      const sent = answer
        ? await this.send(conversation, answer.text, answer.buttons)
        : await this.send(conversation, 'این مورد را فروشنده بهتر می‌داند؛ پیامتان را برای ایشان می‌فرستم.');
      this.audit.record({ action: 'instagram.clarify_pick', entity: 'conversation', entityId: conversation.id, shopId: conversation.shopId, meta: { intent } });
      return { status: 'handled', replies: sent ? 1 : 0, kind: 'clarify_pick' };
    }

    if (payload.startsWith('pg:')) {
      const page = Math.max(0, Number.parseInt(payload.slice(3), 10) || 0);
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
      const sent = await this.send(conversation, reply.text, reply.buttons);
      return { status: 'handled', replies: sent ? 1 : 0, kind: 'list_page' };
    }

    if (payload.startsWith('p:')) {
      const productId = payload.slice(2);
      const product = (await this.catalog(conversation.shopId)).find(item => item.id === productId);
      if (!product) {
        const sent = await this.send(conversation, 'این محصول دیگر موجود نیست. با نوشتن «محصولات» فهرست را ببینید.');
        return { status: 'handled', replies: sent ? 1 : 0, kind: 'product_gone' };
      }
      const reply = describeProduct(product, 'قیمت');
      const sent = await this.send(conversation, reply.text, reply.buttons);
      this.audit.record({ action: 'instagram.product_pick', entity: 'conversation', entityId: conversation.id, shopId: conversation.shopId, meta: { productId, title: product.title } });
      return { status: 'handled', replies: sent ? 1 : 0, kind: 'product_pick' };
    }

    if (payload.startsWith('ord:')) return this.startOrder(conversation, payload.slice(4));

    if (payload.startsWith('flow:')) {
      const draft = TelegramService.readDraft(conversation.draft);
      if (!draft) {
        const sent = await this.send(conversation, 'سفارش فعالی نیست. از فهرست محصولات شروع کنید.');
        return { status: 'handled', replies: sent ? 1 : 0, kind: 'no_draft' };
      }
      return this.continueOrder(conversation, draft, { data: payload });
    }

    if (payload.startsWith('watch:')) {
      const productId = payload.slice(6);
      const product = await this.db.product.findFirst({
        where: { shopId: conversation.shopId, id: productId, active: true },
        select: { id: true, title: true },
      });
      if (!product) {
        const sent = await this.send(conversation, 'این محصول دیگر در کاتالوگ نیست.');
        return { status: 'handled', replies: sent ? 1 : 0, kind: 'watch_gone' };
      }
      await this.db.stockAlert.upsert({
        where: { shopId_chatId_productId: { shopId: conversation.shopId, chatId: conversation.chatId, productId } },
        create: { shopId: conversation.shopId, productId, chatId: conversation.chatId, firstName: conversation.firstName },
        update: { notifiedAt: null },
      });
      const sent = await this.send(conversation, `🔔 ثبت شد. به‌محض شارژ شدن «${product.title}» همین‌جا خبرتان می‌کنم.`);
      return { status: 'handled', replies: sent ? 1 : 0, kind: 'stock_watch' };
    }

    this.audit.record({ action: 'instagram.payload_ignored', entity: 'conversation', entityId: conversation.id, shopId: conversation.shopId, meta: { payload: payload.slice(0, 80) } });
    return { status: 'ignored', reason: 'unknown_payload' };
  }

  // -------------------------------------------------------------- سفارش
  private async startOrder(conversation: Conversation, variantId: string): Promise<InstagramHandleResult> {
    const variant = await this.db.variant.findFirst({
      where: { id: variantId, shopId: conversation.shopId, active: true },
      select: { id: true, size: true, color: true, price: true, stock: true, product: { select: { id: true, title: true, active: true } } },
    });
    if (!variant || !variant.product.active) {
      const sent = await this.send(conversation, 'این محصول دیگر در دسترس نیست.');
      return { status: 'handled', replies: sent ? 1 : 0, kind: 'variant_gone' };
    }
    if (variant.stock <= 0) {
      const sent = await this.send(conversation, `${variant.product.title} موجود نیست. اگر بخواهید به فروشنده اطلاع می‌دهم.`);
      await this.telegram.notifyOwner(conversation.shopId, `🔔 درخواست محصول ناموجود (اینستاگرام): ${variant.product.title}`).catch(() => false);
      return { status: 'handled', replies: sent ? 1 : 0, kind: 'out_of_stock' };
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
    const sent = await this.send(conversation, prompt.text, prompt.buttons);
    this.audit.record({ action: 'instagram.order_started', entity: 'conversation', entityId: conversation.id, shopId: conversation.shopId, meta: { variantId, title: variant.product.title } });
    return { status: 'handled', replies: sent ? 1 : 0, kind: 'order_started' };
  }

  private async continueOrder(
    conversation: Conversation,
    draft: OrderDraft,
    input: { text?: string; data?: string },
  ): Promise<InstagramHandleResult> {
    const outcome = applyInput(draft, { text: input.text, data: input.data, telegramName: conversation.firstName });
    if (outcome.kind === 'cancel') {
      await this.clearDraft(conversation.id);
      const sent = await this.send(conversation, outcome.reply.text);
      this.audit.record({ action: 'instagram.order_cancelled', entity: 'conversation', entityId: conversation.id, shopId: conversation.shopId, meta: { title: draft.title } });
      return { status: 'handled', replies: sent ? 1 : 0, kind: 'order_cancelled' };
    }
    if (outcome.kind === 'ready') return this.finishOrder(conversation, outcome.draft);

    await this.saveDraft(conversation.id, outcome.draft);
    const sent = await this.send(conversation, outcome.reply.text, outcome.reply.buttons);
    return { status: 'handled', replies: sent ? 1 : 0, kind: outcome.kind === 'invalid' ? 'order_invalid' : 'order_step' };
  }

  private async finishOrder(conversation: Conversation, draft: OrderDraft): Promise<InstagramHandleResult> {
    const publicUrl = PaymentsService.publicUrl;
    if (!publicUrl) {
      await this.send(conversation, 'فعلاً امکان ساخت لینک پرداخت نیست. سفارش شما را به فروشنده اطلاع دادم تا هماهنگ کند.');
      await this.telegram.notifyOwner(conversation.shopId, [
        `🔔 سفارش دستی (اینستاگرام): ${draftTitle(draft)} × ${(draft.quantity ?? 1).toLocaleString('fa-IR')}`,
        `گیرنده: ${draft.name ?? '—'} · ${draft.phone ?? '—'}`,
        `نشانی: ${fullAddress(draft) || '—'}`,
        '',
        'PUBLIC_API_URL روی سرور تنظیم نشده، پس لینک پرداخت ساخته نشد.',
      ].join('\n')).catch(() => false);
      await this.clearDraft(conversation.id);
      return { status: 'handled', replies: 1, kind: 'order_no_payment' };
    }

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
      const payment = await this.payments.start(
        conversation.shopId,
        { id: order.id, code: order.code, total: order.total, customerPhone: order.customerPhone },
        publicUrl,
      );
      await this.clearDraft(conversation.id);

      const text = [
        '🧾 <b>سفارش شما ساخته شد</b>',
        '',
        `🆔 کد سفارش: ${order.code}`,
        `🛍 ${draftTitle(draft)}`,
        `🔢 ${(draft.quantity ?? 1).toLocaleString('fa-IR')} عدد`,
        `💰 مبلغ: ${order.total.toLocaleString('fa-IR')} تومان`,
        `📍 ${fullAddress(draft)}`,
        '',
        'برای تکمیل، دکمه‌ی پرداخت را بزنید.',
        'اگر پرداخت نکنید، تا ۲۴ ساعت دیگر لغو و موجودی آزاد می‌شود.',
      ].join('\n');
      const sent = await this.send(conversation, text, [[{ text: `💳 پرداخت ${order.total.toLocaleString('fa-IR')} تومان`, url: payment.url }]]);
      await this.telegram.notifyOwner(conversation.shopId, [
        `🧾 <b>سفارش تازه از اینستاگرام</b>`,
        `کد: ${order.code} · مبلغ: ${order.total.toLocaleString('fa-IR')} تومان`,
        `مشتری: ${escapeHtml(draft.name ?? '—')} · ${draft.phone ?? '—'}`,
        `نشانی: ${escapeHtml(fullAddress(draft))}`,
      ].join('\n')).catch(() => false);

      this.audit.record({ action: 'instagram.order_created', entity: 'order', entityId: order.id, shopId: conversation.shopId, meta: { code: order.code, total: order.total } });
      return { status: 'handled', replies: sent ? 1 : 0, kind: 'order_created' };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'خطای نامشخص';
      this.logger.error(`ثبت سفارش اینستاگرام ناموفق: ${message}`);
      await this.clearDraft(conversation.id);
      await this.send(conversation, 'ثبت سفارش انجام نشد. سفارش شما را به فروشنده اطلاع دادم.');
      await this.telegram.notifyOwner(conversation.shopId, `⚠️ ثبت سفارش اینستاگرام ناموفق بود: ${escapeHtml(message)}`).catch(() => false);
      return { status: 'handled', replies: 1, kind: 'order_failed' };
    }
  }

  private async confirmDelivery(conversation: Conversation, text: string): Promise<InstagramHandleResult | null> {
    const order = await this.orders.confirmDeliveryByCustomer(conversation.shopId, conversation.chatId);
    if (!order) return null;
    await this.logInbound(conversation, text);
    const message = [
      `✅ سفارش ${order.code} تحویل شد.`,
      'ممنون که تحویلش را تأیید کردید 🌿',
      'اگر دوست داشتید، نظرتان درباره‌ی خرید را همین‌جا بنویسید.',
    ].join('\n');
    const sent = await this.send(conversation, message);
    if (sent) await this.logOutbound(conversation, message, 'bot');
    this.audit.record({ action: 'instagram.delivery_confirmed', entity: 'order', entityId: order.id, shopId: conversation.shopId, meta: { code: order.code } });
    return { status: 'handled', replies: sent ? 1 : 0, kind: 'delivery_confirmed' };
  }

  // -------------------------------------------------------------- کامنت‌ها
  /**
   * کامنت‌ها: پاسخ عمومی فقط وقتی که مطمئنیم و مفید است.
   *
   * پرسش «قیمت؟» روی یک پست، رایج‌ترین کامنت است. اگر محصول همان پست در کاتالوگ
   * پیدا شود، قیمت همان محصول عمومی جواب داده می‌شود و مشتری به دایرکت هدایت
   * می‌شود؛ در غیر این صورت فقط ثبت می‌کنیم — پاسخ حدسی روی کامنت عمومی، آبروی
   * فروشنده است.
   */
  private async handleComment(shopId: string, comment: InstagramComment): Promise<void> {
    const commentId = (comment.comment_id ?? comment.id ?? '').trim();
    const text = (comment.text ?? '').trim();
    if (!commentId || !text) return;

    const shop = await this.shop(shopId);
    const products = await this.catalog(shopId);
    const reply = composeReply(text, shop, products, { round: 0 });
    const product = reply.buttons?.flat().map(button => button.data).find(data => data?.startsWith('p:'));
    const title = product ? products.find(item => item.id === product.slice(2))?.title : '';

    if (reply.kind !== 'answer' && reply.kind !== 'clarify') {
      this.audit.record({ action: 'instagram.comment_skipped', entity: 'comment', shopId, meta: { commentId, kind: reply.kind } });
      return;
    }
    const message = title
      ? `${title} — ${toPlainText(reply.text).split('\n').find(line => line.includes('تومان')) ?? toPlainText(reply.text).slice(0, 180)}\n\nبرای سفارش، همین‌جا دایرکت بدهید 🌿`
      : `${toPlainText(reply.text).slice(0, 220)}\n\nبرای جزئیات بیشتر دایرکت بدهید 🌿`;
    const result = await this.client.replyComment(commentId, message);
    this.audit.record({
      action: result.ok ? 'instagram.comment_replied' : 'instagram.comment_failed',
      entity: 'comment', shopId,
      meta: { commentId, error: result.ok ? null : result.error },
    });
  }

  // -------------------------------------------------------------- ارسال
  /**
   * ارسال پاسخ مغز بات به دایرکت.
   *
   * سه کار انجام می‌دهد که اگر جا بیفتند مشتری پیام ناخوانا می‌بیند: حذف تگ‌های
   * HTML، شکستن متن بلندتر از سقف دایرکت، و نگاشت دکمه‌ها به دکمه/پاسخ سریع.
   * دکمه‌ها فقط به آخرین تکه می‌چسبند تا وسط پیام نصفه نمانند.
   */
  private async send(conversation: ChatTarget, html: string, buttons?: BotButton[][]): Promise<boolean> {
    const recipientId = InstagramService.recipientOf(conversation.chatId);
    const actions = toInstagramActions(buttons);
    const plain = toPlainText(html);
    const withLinks = actions.links.length
      ? `${plain}\n\n${actions.links.map((link, index) => `🔗 ${index + 1}. ${link}`).join('\n')}`
      : plain;
    const parts = splitInstagramMessage(withLinks);
    if (parts.length === 0) return false;

    if (!this.configured) {
      this.logger.warn('INSTAGRAM_API_KEY/INSTAGRAM_ACCOUNT_ID ست نشده؛ پیام دایرکت ارسال نشد.');
      return false;
    }

    let allOk = true;
    for (const [index, part] of parts.entries()) {
      const last = index === parts.length - 1;
      const result = await this.client.sendMessage({
        recipientId,
        message: part,
        buttons: last ? actions.buttons : undefined,
        quickReplies: last ? actions.quickReplies : undefined,
      });
      if (!result.ok) {
        allOk = false;
        this.logger.warn(`ارسال دایرکت به ${mask(recipientId)} ناموفق: ${result.error}`);
        this.audit.record({
          action: 'instagram.send_failed', entity: 'conversation', entityId: conversation.id,
          shopId: conversation.shopId, meta: { error: result.error, status: result.status ?? null },
        });
      }
    }
    return allOk;
  }

  /** ارسال پیام ساده از سمت پنل (پاسخ فروشنده). */
  async sendFromPanel(shopId: string, chatId: string, text: string) {
    const conversation = await this.db.telegramConversation.findFirst({
      where: { shopId, chatId },
      select: { id: true, shopId: true, chatId: true, firstName: true, username: true },
    });
    if (!conversation) return { ok: false as const, error: 'این گفتگو پیدا نشد.' };
    if (!this.configured) return { ok: false as const, error: 'اتصال اینستاگرام کامل نیست؛ INSTAGRAM_API_KEY را تنظیم کنید.' };
    const sent = await this.send(conversation, text);
    return sent ? { ok: true as const } : { ok: false as const, error: 'ارسال دایرکت ناموفق بود؛ لاگ سرور را ببینید.' };
  }

  // -------------------------------------------------------------- کمکی‌ها
  private async shop(shopId: string): Promise<BrainShop> {
    return this.db.shop.findUniqueOrThrow({
      where: { id: shopId },
      select: { shipping: true, payment: true, workingHours: true, returns: true, handoffMessage: true, name: true },
    }) as unknown as BrainShop;
  }

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

  private async recentMessages(shopId: string, chatId: string, take: number) {
    const rows = await this.db.chatMessage.findMany({
      where: { shopId, chatId },
      orderBy: { createdAt: 'desc' },
      take,
      select: { direction: true, text: true },
    });
    return rows.reverse().map(row => ({ direction: row.direction === 'in' ? 'in' as const : 'out' as const, text: row.text }));
  }

  private async recentTranscript(conversation: ChatTarget, take: number): Promise<string[]> {
    try {
      const rows = await this.db.chatMessage.findMany({
        where: { shopId: conversation.shopId, chatId: conversation.chatId },
        orderBy: { createdAt: 'desc' },
        take,
        select: { direction: true, text: true },
      });
      return rows.reverse().map(item => `${item.direction === 'in' ? 'مشتری' : 'فروشنده'}: ${item.text.slice(0, 120)}`);
    } catch {
      return [];
    }
  }

  private async logInbound(conversation: ChatTarget, text: string): Promise<void> {
    try {
      await this.db.chatMessage.create({
        data: {
          shopId: conversation.shopId,
          chatId: conversation.chatId,
          direction: 'in',
          author: 'customer',
          text: text.slice(0, 4000),
        },
      });
      this.realtime.emitShop(conversation.shopId, 'chat', { chatId: conversation.chatId, author: 'customer', channel: 'instagram' });
    } catch (error) {
      this.logger.warn(`ثبت پیام ورودی اینستاگرام ناموفق: ${error instanceof Error ? error.message : 'unknown'}`);
    }
  }

  private async logOutbound(conversation: ChatTarget, text: string, author: 'bot' | 'seller'): Promise<void> {
    try {
      await this.db.chatMessage.create({
        data: {
          shopId: conversation.shopId,
          chatId: conversation.chatId,
          direction: 'out',
          author,
          text: text.slice(0, 4000),
        },
      });
    } catch (error) {
      this.logger.warn(`ثبت پیام خروجی اینستاگرام ناموفق: ${error instanceof Error ? error.message : 'unknown'}`);
    }
  }

  private async saveDraft(conversationId: string, draft: OrderDraft): Promise<void> {
    await this.db.telegramConversation.update({
      where: { id: conversationId },
      data: { draft: draft as unknown as Prisma.InputJsonValue },
    });
  }

  private async clearDraft(conversationId: string): Promise<void> {
    await this.db.telegramConversation.update({ where: { id: conversationId }, data: { draft: Prisma.DbNull } });
  }
}

// ------------------------------------------------------------------ کمکی‌ها
function extract(data: unknown, key: string): unknown {
  if (!data || typeof data !== 'object') return undefined;
  return (data as Record<string, unknown>)[key];
}

function asArray<T>(value: unknown): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value as T[] : [value as T];
}

/** نگه‌داشتن بخش کوچکی از یک شناسه برای لاگ و پنل؛ خودِ شناسه محرمانه نیست ولی نیازی به نمایش کامل هم نیست. */
export function mask(value: string): string {
  const clean = (value ?? '').trim();
  if (!clean) return '';
  if (clean.length <= 8) return `${clean.slice(0, 2)}…`;
  return `${clean.slice(0, 8)}…${clean.slice(-4)}`;
}

function escapeHtml(input: string): string {
  return input.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    PENDING_PAYMENT: 'در انتظار پرداخت',
    PAID: 'پرداخت‌شده',
    SHIPPED: 'ارسال‌شده',
    COMPLETED: 'تکمیل‌شده',
    CANCELLED: 'لغوشده',
  };
  return labels[status] ?? status;
}

/** همان الگوی تلگرام: هرکاری از بودجه رد شد، پاسخ آماده برمی‌گردد. */
async function withBudget<T>(work: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const guard = new Promise<T>(resolve => { timer = setTimeout(() => resolve(fallback), ms); });
  try {
    return await Promise.race([work.catch(() => fallback), guard]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
