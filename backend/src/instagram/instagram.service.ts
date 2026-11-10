import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { AuditService } from '../logging/audit.service';
import { AiService } from '../ai/ai.service';
import { OrdersService } from '../orders/orders.service';
import { PaymentsService } from '../payments/payments.service';
import { TelegramService } from '../telegram/telegram.service';
import { discover, productCodeOf, type CatalogProduct } from '../catalog/discovery';
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
import { InstagramClient, type InstagramAccount } from './instagram.client';
import {
  instagramConfigured,
  instagramConnectable,
  readInstagramConfig,
  webhookUrl,
  type InstagramConfig,
} from './instagram.config';
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

/** یک گزینه در فهرست «پیج خودت را انتخاب کن» در پنل. */
type AccountOption = {
  id: string;
  username: string;
  profilePhoto: string;
  active: boolean;
  expiresAt: string | null;
  /** پیجی که همین حالا به این فروشگاه وصل است. */
  mine: boolean;
};

/** پیج متصل به یک فروشگاه، همراه فیلدهای نمایشی. */
type LinkedAccount = {
  id: string;
  username: string;
  profilePhoto: string;
  expiresAt: string | null;
  linkedAt: string | null;
  active: boolean;
};

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
   * وضعیت اتصال برای پنل — **همیشه از دید همان فروشگاه**.
   *
   * توکن و سکرت هرگز برنمی‌گردند؛ فقط «ست شده یا نه». پیج هم مال همین فروشگاه
   * است (از `Channel`)، نه از env: هر فروشگاه پیج خودش را دارد.
   */
  async status(shopId: string) {
    const account = await this.account(shopId);
    const [messages, conversations, lastEvent] = await Promise.all([
      this.db.chatMessage.count({ where: { shopId, chatId: { startsWith: InstagramService.CHAT_PREFIX } } }),
      this.db.telegramConversation.count({ where: { shopId, chatId: { startsWith: InstagramService.CHAT_PREFIX } } }),
      this.db.auditLog.findFirst({
        where: { shopId, action: { startsWith: 'instagram.' } },
        orderBy: { createdAt: 'desc' },
        select: { action: true, createdAt: true },
      }),
    ]);

    const expiresAt = account?.expiresAt ?? null;
    const daysLeft = expiresAt ? Math.ceil((Date.parse(expiresAt) - Date.now()) / 86_400_000) : null;

    return {
      /** سمت سرور آماده است (کلید API هست). */
      configured: this.configured,
      /** دکمه‌ی «اتصال پیج» قابل استفاده است (لینک ورود حساب تنظیم شده). */
      connectable: instagramConnectable(this.config),
      /** آیا همین فروشگاه پیجی وصل کرده است. */
      accountLinked: Boolean(account?.id),
      account: account
        ? {
          id: account.id,
          username: account.username,
          profilePhoto: account.profilePhoto,
          expiresAt,
          daysLeft,
          active: account.active,
          linkedAt: account.linkedAt,
        }
        : null,
      webhookUrl: webhookUrl(this.config),
      webhookUrlIsHttps: webhookUrl(this.config).startsWith('https://'),
      signatureEnforced: this.config.webhookSecret.length > 0,
      stats: { messages, conversations, lastEventAt: lastEvent?.createdAt.toISOString() ?? null, lastEventAction: lastEvent?.action ?? '' },
    };
  }

  /**
   * لینک ورود حساب برای فروشنده.
   *
   * این لینک را عمداً در `status` نمی‌فرستیم (توکن ورود داخلش است)؛ فقط با
   * درخواست احراز‌شده و هنگام کلیک برمی‌گردد. هر باز کردن، در audit ثبت می‌شود
   * تا اگر روزی پیج ناشناسی به پلتفرم وصل شد، ردش را داشته باشیم.
   */
  connectUrl(shopId: string, userId?: string): string {
    if (!instagramConnectable(this.config)) return '';
    this.audit.record({
      action: 'instagram.connect_link_opened', entity: 'shop', entityId: shopId, shopId, userId,
      meta: {},
    });
    return this.config.loginUrl;
  }

  /**
   * پیج‌های قابل انتخاب برای این فروشگاه.
   *
   * فهرست از BoxAPI می‌آید (`/service/accounts`) و با اتصال‌های ثبت‌شده در
   * دیتابیس تلاقی داده می‌شود:
   *   - پیج آزاد → قابل انتخاب
   *   - پیج خود این فروشگاه → «وصل است»
   *   - پیج فروشگاه دیگر → **حذف می‌شود**؛ نام کاربری پیج دیگران نباید در پنل
   *     این فروشگاه دیده شود.
   */
  async accounts(shopId: string) {
    if (!this.configured) {
      return { ok: false as const, error: 'کلید API اینستاگرام روی سرور تنظیم نشده است.', items: [] as AccountOption[] };
    }
    const listed = await this.client.listAccounts();
    if (!listed.ok) {
      return { ok: false as const, error: `دریافت پیج‌ها از BoxAPI انجام نشد: ${listed.error}`, items: [] as AccountOption[] };
    }

    const own = await this.account(shopId);
    const taken = await this.db.channel.findMany({
      where: { instagramAccountId: { not: null } },
      select: { shopId: true, instagramAccountId: true },
    });
    const takenByOthers = new Map(
      taken
        .filter(row => row.shopId !== shopId && row.instagramAccountId)
        .map(row => [row.instagramAccountId as string, row.shopId]),
    );

    const items: AccountOption[] = [];
    for (const item of listed.data) {
      if (takenByOthers.has(item.id)) continue;
      const mine = item.id === own?.id;
      items.push({
        id: item.id,
        username: item.username,
        profilePhoto: item.profilePhoto,
        active: item.active,
        expiresAt: item.expiresAt,
        mine,
      });
    }
    return { ok: true as const, items };
  }

  /**
   * وصل‌کردن یک پیج به فروشگاه.
   *
   * اعتبارسنجی سه‌لایه است و هر سه لازم‌اند:
   *  ۱. پیج باید در فهرست حساب خودِ پلتفرم باشد (یعنی واقعاً لاگین شده).
   *  ۲. نباید به فروشگاه دیگری وصل باشد (وگرنه پیام‌های دو فروشگاه قاطی می‌شود).
   *  ۳. اگر همین فروشگاه پیج دیگری داشت، جایگزین می‌شود (فروشنده ممکن است
   *     پیجش را عوض کند) — ولی پیوستگی گفتگوها حفظ می‌شود چون کلید گفتگو
   *     `ig:<IGSID>` است نه شناسه‌ی پیج.
   */
  async link(shopId: string, accountId: string, userId?: string) {
    if (!this.configured) return { ok: false as const, error: 'کلید API اینستاگرام روی سرور تنظیم نشده است.' };
    const id = accountId.trim();
    if (!id) return { ok: false as const, error: 'پیجی انتخاب نشده است.' };

    const listed = await this.client.listAccounts();
    if (!listed.ok) return { ok: false as const, error: `دریافت پیج‌ها از BoxAPI انجام نشد: ${listed.error}` };
    const found = listed.data.find(item => item.id === id);
    if (!found) return { ok: false as const, error: 'این پیج در فهرست حساب باکس‌ای‌پی نیست؛ اول با لینک ورود، پیج را اجازه بدهید.' };

    const conflict = await this.db.channel.findFirst({
      where: { instagramAccountId: id, NOT: { shopId } },
      select: { shopId: true },
    });
    if (conflict) return { ok: false as const, error: 'این پیج قبلاً به فروشگاه دیگری وصل شده است.' };

    await this.db.channel.upsert({
      where: { shopId },
      create: {
        shopId,
        code: TelegramService.generateCode(),
        instagramAccountId: id,
        instagramUsername: found.username,
        instagramProfilePhoto: found.profilePhoto,
        instagramExpiresAt: found.expiresAt ? new Date(found.expiresAt) : null,
        instagramLinkedAt: new Date(),
      },
      update: {
        instagramAccountId: id,
        instagramUsername: found.username,
        instagramProfilePhoto: found.profilePhoto,
        instagramExpiresAt: found.expiresAt ? new Date(found.expiresAt) : null,
        instagramLinkedAt: new Date(),
      },
    });

    this.audit.record({
      action: 'instagram.account_linked', entity: 'shop', entityId: shopId, shopId, userId,
      meta: { accountId: mask(id), username: found.username },
    });
    return { ok: true as const, username: found.username };
  }

  /** قطع اتصال پیج از این فروشگاه. پیام‌های قبلی و گفتگوها می‌مانند. */
  async unlink(shopId: string, userId?: string) {
    const channel = await this.db.channel.findFirst({
      where: { shopId },
      select: { id: true, instagramAccountId: true, instagramUsername: true },
    });
    if (!channel?.instagramAccountId) return { ok: false as const, error: 'پیجی به این فروشگاه وصل نیست.' };

    await this.db.channel.update({
      where: { id: channel.id },
      data: {
        instagramAccountId: null,
        instagramUsername: null,
        instagramProfilePhoto: null,
        instagramExpiresAt: null,
        instagramLinkedAt: null,
      },
    });
    this.audit.record({
      action: 'instagram.account_unlinked', entity: 'shop', entityId: shopId, shopId, userId,
      meta: { accountId: mask(channel.instagramAccountId), username: channel.instagramUsername },
    });
    return { ok: true as const };
  }

  /** پیج متصلِ همین فروشگاه؛ تنها منبع مجاز برای `account_id` در هر ارسال. */
  private async account(shopId: string): Promise<LinkedAccount | null> {
    const channel = await this.db.channel.findFirst({
      where: { shopId, instagramAccountId: { not: null } },
      select: {
        instagramAccountId: true,
        instagramUsername: true,
        instagramProfilePhoto: true,
        instagramExpiresAt: true,
        instagramLinkedAt: true,
        active: true,
      },
    });
    if (!channel?.instagramAccountId) return null;
    return {
      id: channel.instagramAccountId,
      username: channel.instagramUsername ?? '',
      profilePhoto: channel.instagramProfilePhoto ?? '',
      expiresAt: channel.instagramExpiresAt?.toISOString() ?? null,
      linkedAt: channel.instagramLinkedAt?.toISOString() ?? null,
      active: channel.active,
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
    if (!this.configured) return { ok: false as const, error: 'کلید API اینستاگرام روی سرور تنظیم نشده است.' };
    const account = await this.account(shopId);
    if (!account) return { ok: false as const, error: 'اول پیج اینستاگرام فروشگاه را وصل کنید.' };
    const target = recipientId.trim();
    if (!/^\d{5,32}$/.test(target)) return { ok: false as const, error: 'شناسه‌ی گیرنده باید عددی باشد (IGSID).' };

    const result = await this.client.sendMessage(account.id, {
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
        const record = { eventId: eventId.slice(0, 200), eventType: (payload.event_type ?? '').slice(0, 60) };
        try {
          await this.db.instagramEvent.create({ data: { ...record, payload: safeJson(payload).slice(0, 4000) } });
        } catch (error) {
          // ستون `payload` تازه اضافه شده؛ اگر مهاجرت هنوز روی این محیط اجرا نشده
          // باشد نباید پیام مشتری از دست برود. یک‌بار بدون بدنه تلاش می‌کنیم.
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw error;
          await this.db.instagramEvent.create({ data: record });
        }
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
    // رویدادهای دایرکت همیشه با `event_type: messaging` نمی‌آیند؛ BoxAPI برای
    // پیام‌ها `action.send_message` و شکل‌های تودرتوی دیگری هم می‌فرستد. اگر فقط
    // به نام نوع تکیه کنیم، پیام مشتری بی‌صدا دور ریخته می‌شود (دقیقاً همان
    // «دایرکت دادم ولی چیزی نیامد»). پس اول بر اساس نوع می‌خوانیم و اگر پیامی
    // پیدا نشد، بدنه را عمیق می‌گردیم.
    const direct = type === 'messaging' || type === 'messaging_postbacks'
      ? asArray<InstagramMessaging>(extract(payload.data, 'messaging'))
      : [];
    const items = direct.length > 0 ? direct : collectMessages(payload);
    if (items.length > 0) {
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

  /**
   * آخرین رویدادهای webhookِ همین فروشگاه، خلاصه‌شده برای عیب‌یابی.
   *
   * فیلتر با `contains` روی بدنه‌ی خام انجام می‌شود چون جدول رویدادها عمومی است
   * و ستون حساب ندارد؛ وگرنه رویداد فروشگاه دیگر هم دیده می‌شد.
   */
  async recentEvents(shopId: string) {
    const channel = await this.db.channel.findUnique({
      where: { shopId },
      select: { instagramAccountId: true },
    });
    const accountId = channel?.instagramAccountId ?? '';
    if (!accountId) return { ok: true as const, items: [] as { eventType: string; at: string; summary: string }[] };

    const rows = await this.db.instagramEvent.findMany({
      where: { payload: { contains: accountId } },
      orderBy: { receivedAt: 'desc' },
      take: 10,
      select: { eventType: true, receivedAt: true, payload: true },
    });

    return {
      ok: true as const,
      items: rows.map(row => ({
        eventType: row.eventType || '—',
        at: row.receivedAt.toISOString(),
        summary: summarizeEvent(row.payload ?? ''),
      })),
    };
  }

  /**
   * کدام فروشگاه صاحب این حساب است.
   *
   * فقط از دیتابیس: پیج با انتخاب صاحبش در پنل به فروشگاه وصل می‌شود. نسخه‌ی
   * اول این تابع، پیام حساب ناشناس را خودکار به «فروشگاه پیش‌فرض» می‌چسباند؛
   * برای پنل چندفروشگاهی خطرناک است: پیام مشتری یک فروشگاه می‌توانست در گفتگوی
   * فروشگاه دیگر بنشیند. حالا حساب ناشناس فقط ثبت و لاگ می‌شود تا فروشنده از
   * پنل وصلش کند.
   */
  private async resolveShop(accountId: string): Promise<string | null> {
    if (!accountId) return null;
    const channel = await this.db.channel.findUnique({
      where: { instagramAccountId: accountId },
      select: { shopId: true, active: true },
    });
    return channel?.active ? channel.shopId : null;
  }

  // ------------------------------------------------------------------- دایرکت
  private async handleMessaging(shopId: string, item: InstagramMessaging): Promise<InstagramHandleResult> {
    const senderId = (item.sender?.id ?? '').trim();
    if (!senderId) return { status: 'ignored', reason: 'no_sender' };
    // اکوی پیام خودمان/فروشنده: اگر دوباره پردازش شود، بات به خودش جواب می‌دهد.
    if (item.message?.is_echo) return { status: 'ignored', reason: 'echo' };
    // پیام خود پیج (بدون پرچم echo): با شناسه‌ی پیجِ همین فروشگاه مقایسه می‌شود.
    const account = await this.account(shopId);
    if (item.sender?.id && account && item.sender.id === account.id) return { status: 'ignored', reason: 'self' };

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

  /** ذخیره‌ی فهرستی که همین حالا فرستادیم، تا «۱» و «۲» به همان محصول‌ها بخورد. */
  private async rememberList(conversationId: string, reply: BotReply): Promise<void> {
    const picks = productPicks(reply.buttons);
    if (picks.length === 0) return;
    await this.db.telegramConversation.update({
      where: { id: conversationId },
      data: { clarify: { round: 0, listQuery: reply.listQuery ?? 'محصولات فروشگاه', picks } },
    });
  }

  /**
   * انتخاب محصول با شماره‌ی فهرست («۱»/`1`) یا کد محصول («667DF5»).
   *
   * مبنا، فهرستی است که همین حالا برای مشتری فرستاده‌ایم (`clarify.listQuery`)
   * تا شماره با همان ترتیبی که دیده یکی باشد؛ اگر حالتی نبود، کد محصول در کل
   * کاتالوگ جست‌وجو می‌شود (کد، مستقل از فهرست، یکتاست).
   */
  private async pickByOrdinalOrCode(conversation: Conversation, rawText: string): Promise<InstagramHandleResult | null> {
    const text = rawText.trim();
    if (!text || text.length > 24) return null;
    const products = await this.catalog(conversation.shopId);
    if (products.length === 0) return null;

    const state = (conversation.clarify ?? {}) as { picks?: string[] };
    const picks = Array.isArray(state.picks) ? state.picks : [];

    // شماره‌ی گزینه: ارقام فارسی/عربی هم پذیرفته می‌شوند.
    const digits = text.replace(/[۰-۹]/gu, char => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(char)))
      .replace(/[٠-٩]/gu, char => String('٠١٢٣٤٥٦٧٨٩'.indexOf(char)))
      .replace(/[.،)]+$/u, '');
    let product: CatalogProduct | undefined;
    if (/^\d{1,2}$/u.test(digits)) {
      // شماره فقط وقتی معنا دارد که همین حالا فهرستی فرستاده باشیم؛ وگرنه «۱»ِ
      // تنها نباید به‌صورت تصادفی یک محصول را باز کند.
      const index = Number.parseInt(digits, 10);
      if (index < 1) return null;
      if (picks.length > 0) {
        // دقیق‌ترین حالت: همان ترتیبی که مشتری در پیام دیده.
        const id = picks[index - 1];
        product = id ? products.find(item => item.id === id) : undefined;
      }
      // بدون فهرست ذخیره‌شده، شماره را حدس نمی‌زنیم؛ ممکن است آخرین پیام بات
      // «پیدا نشد» بوده باشد و انتخاب تصادفی، بدترین پاسخ است.
      if (!product) return null;
    } else if (/^[a-z0-9]{4,8}$/iu.test(text)) {
      const wanted = text.toUpperCase();
      product = products.find(item => productCodeOf(item) === wanted || item.code?.toUpperCase() === wanted);
    }
    if (!product) return null;

    const reply = describeProduct(product, 'قیمت');
    await this.logInbound(conversation, rawText);
    const sent = await this.send(conversation, reply.text, reply.buttons);
    if (sent) await this.logOutbound(conversation, toPlainText(reply.text), 'bot');
    this.audit.record({
      action: 'instagram.product_pick', entity: 'conversation', entityId: conversation.id, shopId: conversation.shopId,
      meta: { via: /^\d/u.test(digits) ? 'number' : 'code', productId: product.id, title: product.title },
    });
    return { status: 'handled', replies: sent ? 1 : 0, kind: 'product_pick' };
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

    // ۱.۵) انتخاب با شماره یا کد محصول.
    //      چرا لازم است: پاسخ سریع/دکمه‌ی اینستاگرام فقط در **اپ موبایل** دیده
    //      می‌شود و در نسخه‌ی وب/دسکتاپ اینستاگرام رندر نمی‌شود (محدودیت خود
    //      متا). پس مشتری وب‌کار فقط متن می‌بیند؛ اگر تایپ «۱» یا «667DF5» کار
    //      نکند، راهی برای انتخاب و ثبت سفارش ندارد.
    const picked = await this.pickByOrdinalOrCode(conversation, rawText);
    if (picked) return picked;

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
          // `listQuery` باید از پاسخ قاعده‌محور بماند: حالت «فهرست فرستاده‌شده» را
          // نگه می‌دارد و انتخاب با شماره/صفحه‌ی بعدی به آن وابسته است. از دست
          // رفتنش یعنی مشتری بعد از فهرست نمی‌تواند «۱» بفرستد.
          listQuery: reply.listQuery,
          pageInfo: reply.pageInfo,
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
    // `picks` = همان محصول‌هایی که در همین پیام فهرست شدند، به همان ترتیب.
    // شماره‌ی مشتری («۱»، «۲»، …) با این فهرست تطبیق داده می‌شود، نه با حدس.
    const picks = productPicks(reply.buttons);
    const clarifyState = unclear
      ? { round: round + 1, last: rawText.slice(0, 200) }
      : picks.length > 0
        ? { round: 0, listQuery: reply.listQuery ?? 'محصولات فروشگاه', picks }
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

    // فهرست محصول با دکمه/پاسخ سریع می‌آید، ولی در نسخه‌ی وب اینستاگرام دکمه‌ها
    // دیده نمی‌شوند؛ یک جمله‌ی کوتاه راه دوم را نشان می‌دهد.
    // راهنمای مشتری: اول پیشنهاد اپ، بعد راه‌حل جایگزین. دکمه در نسخه‌ی وب
    // اینستاگرام رندر نمی‌شود، پس اگر مشتری وب‌کار است باید بداند بهترین تجربه
    // در اپ است — و اگر همین حالا نمی‌تواند اپ را باز کند، شماره/کد کار می‌کند.
    const text = picks.length > 1
      ? `${reply.text}\n\n📱 برای انتخاب با دکمه، این گفتگو را در اپ اینستاگرام باز کنید.`
        + '\nاگر با نسخه‌ی وب هستید، شماره (مثلاً ۱) یا کد محصول را بفرستید.'
      : reply.text;

    await this.logInbound(conversation, rawText);
    const sent = await this.send(conversation, text, reply.buttons);
    // در تاریخچه همان چیزی ثبت می‌شود که مشتری **دید** — یعنی متن بدون تگ.
    // اگر HTML مغز بات را ذخیره کنیم، پنل تگ‌های <b>/<code> را عیناً نشان می‌داد.
    if (sent) await this.logOutbound(conversation, toPlainText(text), 'bot');

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
      await this.rememberList(conversation.id, reply);
      const text = products.length
        ? `${reply.text}\n\n📱 برای انتخاب با دکمه، این گفتگو را در اپ اینستاگرام باز کنید.`
          + '\nاگر با نسخه‌ی وب هستید، شماره (مثلاً ۱) یا کد محصول را بفرستید.'
        : reply.text;
      const sent = await this.send(conversation, text, reply.buttons);
      if (sent) await this.logOutbound(conversation, toPlainText(text), 'bot');
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
      await this.rememberList(conversation.id, reply);
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
    const account = await this.account(shopId);
    if (!account) return;
    const result = await this.client.replyComment(account.id, commentId, message);
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
      this.logger.warn('INSTAGRAM_API_KEY ست نشده؛ پیام دایرکت ارسال نشد.');
      return false;
    }
    // پیج از فروشگاهِ همین گفتگو خوانده می‌شود؛ هرگز از env یا از فروشگاه دیگر.
    const account = await this.account(conversation.shopId);
    if (!account) {
      this.logger.warn(`فروشگاه ${conversation.shopId} پیج اینستاگرام وصل نکرده؛ پیام ارسال نشد.`);
      this.audit.record({
        action: 'instagram.send_no_account', entity: 'conversation', entityId: conversation.id,
        shopId: conversation.shopId, meta: { chatId: conversation.chatId },
      });
      return false;
    }

    let allOk = true;
    for (const [index, part] of parts.entries()) {
      const last = index === parts.length - 1;
      const result = await this.client.sendMessage(account.id, {
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
    if (!this.configured) return { ok: false as const, error: 'کلید API اینستاگرام روی سرور تنظیم نشده است.' };
    if (!await this.account(shopId)) return { ok: false as const, error: 'پیج اینستاگرام این فروشگاه وصل نیست؛ از تنظیمات وصل کنید.' };
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
/**
 * خلاصه‌ی یک بدنه‌ی webhook برای نمایش در پنل: نوع کلیدها، شمار پیام‌های
 * شناسایی‌شده و شناسه‌ی (ماسک‌شده‌ی) فرستنده. متن پیام مشتری عمداً نمی‌آید.
 */
function summarizeEvent(raw: string): string {
  if (!raw) return '';
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return 'بدنه خوانده نشد';
  }
  const messages = collectMessages(parsed);
  const keys = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? Object.keys(parsed as Record<string, unknown>).slice(0, 6).join(', ')
    : Array.isArray(parsed) ? 'آرایه' : typeof parsed;
  if (messages.length > 0) {
    const senders = messages.map(m => mask(String(m.sender?.id ?? ''))).filter(Boolean).slice(0, 2).join(' / ');
    const echoes = messages.filter(m => m.message?.is_echo).length;
    return `${messages.length} پیام${echoes ? ` (${echoes} اکو)` : ''} · فرستنده ${senders || '—'}`;
  }
  return `بدون پیام · کلیدها: ${keys || '—'}`;
}

/** شناسه‌ی محصول‌هایی که در دکمه‌های یک پاسخ فهرست شده‌اند، به همان ترتیب. */
function productPicks(rows?: BotButton[][]): string[] {
  return (rows ?? [])
    .flat()
    .map(button => button.data ?? '')
    .filter(data => data.startsWith('p:'))
    .map(data => data.slice(2))
    .filter(Boolean);
}

/** JSON امن برای ذخیره؛ حلقه‌ی مرجع یا BigInt نباید ثبت رویداد را بشکند. */
function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value) ?? '';
  } catch {
    return '';
  }
}

/**
 * همه‌ی پیام‌های درون یک بدنه‌ی webhook، با هر شکلی که آمده باشد.
 *
 * چرا این‌قدر باز است: مستندات BoxAPI یک شکل (`data.messaging[]`) می‌دهد، ولی
 * بدنه‌ی واقعی برای هر رویداد متفاوت است (تودرتو در `data.entry[]`، یا سطح
 * بالا، یا پیام واحد با کلیدهای `sender`/`message`). اتکا به یک شکل یعنی «پیام
 * مشتری رسید ولی سایت چیزی نشان نداد». این تابع تا چند سطح می‌گردد و هر شیئی
 * که هم فرستنده و هم متن/پیام دارد را نرمال می‌کند.
 */
export function collectMessages(payload: unknown): InstagramMessaging[] {
  const found: InstagramMessaging[] = [];
  const seen = new Set<unknown>();

  const visit = (node: unknown, depth: number) => {
    if (found.length >= 20 || depth > 6 || !node || typeof node !== 'object') return;
    if (seen.has(node)) return;
    seen.add(node);

    if (Array.isArray(node)) {
      for (const item of node) visit(item, depth + 1);
      return;
    }

    const record = node as Record<string, unknown>;
    const normalized = normalizeMessage(record);
    if (normalized) {
      found.push(normalized);
      return;
    }
    for (const value of Object.values(record)) visit(value, depth + 1);
  };

  visit(payload, 0);
  return found;
}

/** یک شیء نامشخص را به قالب `InstagramMessaging` تبدیل می‌کند؛ اگر پیام نبود `null`. */
function normalizeMessage(record: Record<string, unknown>): InstagramMessaging | null {
  const senderRaw = record.sender ?? record.from;
  const senderId = typeof senderRaw === 'string'
    ? senderRaw
    : (senderRaw as { id?: string } | undefined)?.id;
  const messageRaw = record.message ?? (typeof record.text === 'string' ? record : undefined);
  if (!senderId || !messageRaw || typeof messageRaw !== 'object') return null;

  const message = messageRaw as Record<string, unknown>;
  const text = typeof message.text === 'string'
    ? message.text
    : typeof message.content === 'string'
      ? message.content
      : '';
  const attachments = Array.isArray(message.attachments) ? message.attachments : undefined;
  // پیام بدون متن و بدون پیوست چیزی برای پاسخ دادن ندارد؛ رویدادهایی مثل
  // «دیده شد» یا «تایپ می‌کند» اینجا رد می‌شوند.
  if (!text && !attachments?.length) return null;

  const recipientRaw = record.recipient ?? record.to;
  const mid = message.mid ?? message.id ?? record.mid ?? record.message_id ?? record.id;

  return {
    sender: {
      id: String(senderId),
      name: typeof senderRaw === 'object' ? (senderRaw as { name?: string }).name : undefined,
      username: typeof senderRaw === 'object' ? (senderRaw as { username?: string }).username : undefined,
    },
    recipient: recipientRaw
      ? {
        id: typeof recipientRaw === 'string'
          ? recipientRaw
          : String((recipientRaw as { id?: string }).id ?? ''),
      }
      : undefined,
    timestamp: typeof record.timestamp === 'number' ? record.timestamp : undefined,
    message: {
      mid: typeof mid === 'string' ? mid : undefined,
      text,
      is_echo: Boolean(message.is_echo ?? record.is_echo),
      quick_reply: message.quick_reply as { payload?: string } | undefined,
      attachments,
    },
    postback: record.postback as InstagramMessaging['postback'],
    reaction: record.reaction as InstagramMessaging['reaction'],
  };
}

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
