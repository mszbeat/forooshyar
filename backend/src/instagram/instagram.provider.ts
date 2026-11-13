/**
 * لایه‌ی ارائه‌دهنده‌ی اینستاگرام (تسک Meta).
 *
 * چرا interface: BoxAPI اشتراک ماهانه دارد و API رسمی متا رایگان است. منطق
 * ربات (دایرکت، کامنت، اتوماسیون، سفارش) نباید بداند پیام از کدام مسیر
 * می‌رود؛ پس هر دو پیاده‌سازی یک قرارداد را اجرا می‌کنند و جابه‌جایی فقط
 * با `INSTAGRAM_PROVIDER=meta|boxapi` انجام می‌شود.
 *
 * قواعد مشترک (مثل کلاینت تلگرام):
 *  - هرگز throw نمی‌کند؛ نتیجه برمی‌گرداند.
 *  - سقف زمانی دارد.
 *  - `accountId` در هر درخواست از فروشگاهِ درست می‌آید، نه از env.
 */
import type { PrismaService } from '../database/prisma.service';
import { decryptCard } from '../payments/card-crypto';
import { InstagramClient, type InstagramAccount, type InstagramResult, type SendMessageInput } from './instagram.client';
import type { InstagramConfig } from './instagram.config';

export type InstagramProfile = { username: string; fullName: string; profilePic: string };

export interface InstagramProvider {
  readonly name: 'boxapi' | 'meta';
  get configured(): boolean;
  /** آیا گیت «فالوکننده باشد» پشتیبانی می‌شود (فقط BoxAPI). */
  readonly supportsFollowCheck: boolean;
  sendMessage(accountId: string, input: SendMessageInput): Promise<InstagramResult>;
  replyComment(accountId: string, commentId: string, message: string): Promise<InstagramResult>;
  /** دایرکت خصوصی روی همان کامنت (پنجره‌ی ۷ روزه‌ی متا). */
  privateReply(accountId: string, commentId: string, message: string): Promise<InstagramResult>;
  /** درخواست ناهمگام پروفایل (BoxAPI: نتیجه از webhook برمی‌گردد). */
  requestProfile(accountId: string, senderId: string): Promise<InstagramResult>;
  /** خواندن همگام پروفایل (Meta). اگر پشتیبانی نشود، `{ok:false}` برمی‌گردد. */
  getProfile(accountId: string, senderId: string): Promise<InstagramResult<InstagramProfile>>;
  listAccounts(): Promise<InstagramResult<InstagramAccount[]>>;
  /** اکشن خام BoxAPI (مثل follow_status)؛ در Meta پشتیبانی نمی‌شود. */
  post(accountId: string, action: string, body: Record<string, unknown>): Promise<InstagramResult>;
}

/** ساخت ارائه‌دهنده‌ی فعال بر اساس env. `db` فقط برای Meta (توکن هر فروشگاه) لازم است. */
export function createInstagramProvider(config: InstagramConfig, db?: PrismaService): InstagramProvider {
  if (config.provider === 'meta' && db) return new MetaProvider(config, db);
  return new BoxApiProvider(new InstagramClient(config));
}

/** ارائه‌دهنده‌ی BoxAPI — همان کلاینت فعلی، بدون تغییر رفتار. */
export class BoxApiProvider implements InstagramProvider {
  readonly name = 'boxapi' as const;
  readonly supportsFollowCheck = true;
  constructor(private readonly client: InstagramClient) {}

  get configured(): boolean {
    return this.client.configured;
  }

  sendMessage(accountId: string, input: SendMessageInput): Promise<InstagramResult> {
    return this.client.sendMessage(accountId, input);
  }

  replyComment(accountId: string, commentId: string, message: string): Promise<InstagramResult> {
    return this.client.replyComment(accountId, commentId, message);
  }

  privateReply(accountId: string, commentId: string, message: string): Promise<InstagramResult> {
    return this.client.post(accountId, 'private_reply', { comment_id: commentId, message });
  }

  requestProfile(accountId: string, senderId: string): Promise<InstagramResult> {
    return this.client.requestProfile(accountId, senderId);
  }

  getProfile(): Promise<InstagramResult<InstagramProfile>> {
    // BoxAPI پروفایل را فقط ناهمگام می‌دهد (show_profile)؛ مسیر همگام ندارد.
    return Promise.resolve({ ok: false as const, error: 'پروفایل همگام در BoxAPI نیست.' });
  }

  listAccounts(): Promise<InstagramResult<InstagramAccount[]>> {
    return this.client.listAccounts();
  }

  post(accountId: string, action: string, body: Record<string, unknown>): Promise<InstagramResult> {
    return this.client.post(accountId, action, body);
  }
}

/**
 * ارائه‌دهنده‌ی Meta — API رسمی اینستاگرام (Instagram Login).
 *
 *  - ارسال: `POST /{ig-user-id}/messages` (متن، دکمه‌ی postback/web_url، پاسخ سریع)
 *  - پاسخ کامنت: `POST /{comment-id}/replies`
 *  - دایرکت خصوصی: `POST /{ig-user-id}/messages` با `recipient.comment_id`
 *  - پروفایل: `GET /{igsid}?fields=name,username,profile_pic`
 *
 * توکن هر فروشگاه (بلندمدت، ۶۰ روزه) رمزنگاری‌شده روی `Channel` است و با
 * `accountId` (همان IGSID پیج) پیدا می‌شود؛ هرگز از env خوانده نمی‌شود.
 */
export class MetaProvider implements InstagramProvider {
  readonly name = 'meta' as const;
  readonly supportsFollowCheck = false;
  constructor(
    private readonly config: InstagramConfig,
    private readonly db: PrismaService,
  ) {}

  get configured(): boolean {
    return this.config.metaAppId.length > 0 && this.config.metaAppSecret.length > 0;
  }

  private get base(): string {
    return `https://graph.facebook.com/${this.config.metaGraphVersion}`;
  }

  /** توکن رمزگشایی‌شده‌ی فروشگاهِ صاحب این پیج؛ null یعنی وصل نیست/منقضی است. */
  private async tokenFor(accountId: string): Promise<string | null> {
    const channel = await this.db.channel.findFirst({
      where: { instagramAccountId: accountId, instagramProvider: 'meta' },
      select: { instagramAccessToken: true },
    }).catch(() => null);
    const enc = channel?.instagramAccessToken;
    if (!enc) return null;
    try {
      return decryptCard(enc);
    } catch {
      return null;
    }
  }

  /** اگر توکن باطل شده (کد ۱۹۰)، آن را پاک می‌کنیم تا فروشنده دوباره وصل شود. */
  private async invalidateToken(accountId: string) {
    await this.db.channel.updateMany({
      where: { instagramAccountId: accountId, instagramProvider: 'meta' },
      data: { instagramAccessToken: null, instagramExpiresAt: new Date(0) },
    }).catch(() => undefined);
  }

  private async graph<T = unknown>(
    accountId: string,
    method: 'GET' | 'POST',
    path: string,
    body?: Record<string, unknown>,
  ): Promise<InstagramResult<T>> {
    const token = await this.tokenFor(accountId);
    if (!token) return { ok: false, error: 'پیج اینستاگرام وصل نیست یا دسترسی‌اش منقضی شده است.' };
    const url = `${this.base}/${path.replace(/^\//, '')}?access_token=${encodeURIComponent(token)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      const response = await fetch(url, {
        method,
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: controller.signal,
      });
      const text = await response.text();
      const parsed = text ? safeJson(text) : {};
      const error = (parsed as { error?: { message?: string; code?: number } })?.error;
      if (!response.ok || error) {
        const code = error?.code;
        if (code === 190) await this.invalidateToken(accountId);
        return {
          ok: false,
          status: response.status,
          error: (error?.message ?? `HTTP ${response.status}`).slice(0, 300),
        };
      }
      return { ok: true, data: parsed as T };
    } catch (err) {
      const aborted = err instanceof Error && err.name === 'AbortError';
      return { ok: false, error: aborted ? 'زمان پاسخ متا تمام شد.' : err instanceof Error ? err.message : 'خطای شبکه' };
    } finally {
      clearTimeout(timer);
    }
  }

  async sendMessage(accountId: string, input: SendMessageInput): Promise<InstagramResult> {
    const parts = splitMetaText(input.message);
    if (parts.length === 0) return { ok: false, error: 'متن پیام خالی است.' };
    let last: InstagramResult = { ok: true, data: {} };
    for (const [index, part] of parts.entries()) {
      const lastPart = index === parts.length - 1;
      const body: Record<string, unknown> = {
        recipient: { id: input.recipientId },
        messaging_type: 'RESPONSE',
      };
      if (lastPart && input.buttons?.length) {
        body.message = {
          attachment: {
            type: 'template',
            payload: {
              template_type: 'button',
              text: part,
              buttons: input.buttons.slice(0, 3).map(button => button.type === 'web_url'
                ? { type: 'web_url', url: button.url ?? '', title: (button.title ?? '').slice(0, 20) }
                : { type: 'postback', title: (button.title ?? '').slice(0, 20), payload: button.payload ?? '' }),
            },
          },
        };
      } else if (lastPart && input.quickReplies?.length) {
        body.message = {
          text: part,
          quick_replies: input.quickReplies.slice(0, 13).map(reply => ({
            content_type: 'text',
            title: (reply.title ?? '').slice(0, 20),
            payload: reply.payload,
          })),
        };
      } else {
        body.message = { text: part };
      }
      last = await this.graph(accountId, 'POST', `${accountId}/messages`, body);
      if (!last.ok) return last;
    }
    return last;
  }

  replyComment(accountId: string, commentId: string, message: string): Promise<InstagramResult> {
    return this.graph(accountId, 'POST', `${commentId}/replies`, { message });
  }

  privateReply(accountId: string, commentId: string, message: string): Promise<InstagramResult> {
    return this.graph(accountId, 'POST', `${accountId}/messages`, {
      recipient: { comment_id: commentId },
      messaging_type: 'RESPONSE',
      message: { text: message },
    });
  }

  async requestProfile(accountId: string, senderId: string): Promise<InstagramResult> {
    // در Meta پروفایل همگام خوانده می‌شود؛ این مسیر فقط برای سازگاری است.
    const profile = await this.getProfile(accountId, senderId);
    return profile.ok ? { ok: true, data: {} } : profile;
  }

  async getProfile(accountId: string, senderId: string): Promise<InstagramResult<InstagramProfile>> {
    const id = senderId.trim();
    if (!id) return { ok: false, error: 'شناسه خالی است.' };
    const result = await this.graph<{ name?: string; username?: string; profile_pic?: string }>(
      accountId, 'GET', `${id}?fields=name,username,profile_pic`,
    );
    if (!result.ok) return result;
    const username = (result.data.username ?? '').trim();
    const fullName = (result.data.name ?? '').trim();
    if (!username && !fullName) return { ok: false, error: 'پاسخ متا کاربر نداشت.' };
    return { ok: true, data: { username, fullName, profilePic: (result.data.profile_pic ?? '').trim() } };
  }

  listAccounts(): Promise<InstagramResult<InstagramAccount[]>> {
    // در Meta فهرست مرکزی نیست؛ اتصال با OAuth مستقیم انجام می‌شود.
    return Promise.resolve({ ok: true, data: [] });
  }

  post(): Promise<InstagramResult> {
    return Promise.resolve({ ok: false as const, error: 'این اکشن در API رسمی متا نیست.' });
  }
}

/** سقف متن یک پیام متا ۲۰۰۰ کاراکتر است؛ متن بلند را به چند پیام می‌شکند. */
export function splitMetaText(text: string, limit = 2000): string[] {
  const clean = text.trim();
  if (!clean) return [];
  if (clean.length <= limit) return [clean];
  const parts: string[] = [];
  let current = '';
  for (const line of clean.split('\n')) {
    const piece = line.length > limit ? line.slice(0, limit) : line;
    if ((current + '\n' + piece).length > limit && current) {
      parts.push(current);
      current = piece;
    } else {
      current = current ? `${current}\n${piece}` : piece;
    }
  }
  if (current) parts.push(current);
  return parts;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text.slice(0, 500) };
  }
}
