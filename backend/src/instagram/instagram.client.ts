import type { InstagramConfig } from './instagram.config';

/**
 * کلاینت کم‌ضخامت BoxAPI برای دایرکت اینستاگرام.
 *
 * قواعدی که عمداً رعایت شده‌اند (همان قواعد کلاینت تلگرام، برای اینکه رفتار دو
 * کانال یکسان بماند):
 *  - هرگز throw نمی‌کند؛ نتیجه را برمی‌گرداند. یک خطای شبکه نباید پردازش بقیه‌ی
 *    گفتگو یا ثبت سفارش را بشکند.
 *  - سقف زمانی دارد. BoxAPI کند باشد، پاسخ به مشتری گیر نمی‌کند.
 *  - آدرس پایه قابل تنظیم است تا در تست یک سرور جعلی جای BoxAPI بنشیند.
 */

export type InstagramResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string; status?: number };

export type InstagramButton = {
  type: 'postback' | 'web_url';
  title: string;
  payload?: string;
  url?: string;
};

export type InstagramQuickReply = { content_type: 'text'; title: string; payload: string };

export type SendMessageInput = {
  recipientId: string;
  message: string;
  buttons?: InstagramButton[];
  quickReplies?: InstagramQuickReply[];
  /**
   * اگر true، همان محتوای ارسالی در webhook هم برمی‌گردد. ما عمداً `false`
   * می‌فرستیم و پیام‌های خروجی را خودمان در تاریخچه ثبت می‌کنیم؛ وگرنه هر پیام
   * دو بار (یک‌بار از echo و یک‌بار از ثبت خودمان) در پنل ظاهر می‌شود.
   */
  isEcho?: boolean;
};

export type GenericTemplateElement = {
  title: string;
  subtitle?: string;
  image_url?: string;
  default_action?: { type: 'web_url'; url: string };
  buttons?: InstagramButton[];
};

export class InstagramClient {
  constructor(private readonly config: InstagramConfig) {}

  get configured(): boolean {
    return this.config.apiKey.length > 0;
  }

  /**
   * یک اکشن BoxAPI.
   *
   * `accountId` این‌جا پارامتر است و نه فیلد کلاس: هر فروشگاه پیج خودش را دارد،
   * پس شناسه باید در هر درخواست از فروشگاهِ درست بیاید. اگر در کلاینت قفل شود،
   * پیام یک فروشگاه با پیج فروشگاه دیگر می‌رود — بدترین باگ ممکن در چندمستأجری.
   */
  private async post<T = unknown>(accountId: string, action: string, body: Record<string, unknown>): Promise<InstagramResult<T>> {
    if (!this.configured) {
      return { ok: false, error: 'INSTAGRAM_API_KEY ست نشده است.' };
    }
    const url = `${this.config.baseUrl}/service/actions/${action}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          // توکن فقط در هدر و فقط از سمت سرور.
          'x-api-key': this.config.apiKey,
        },
        body: JSON.stringify({ account_id: accountId, ...body }),
        signal: controller.signal,
      });
      const text = await response.text();
      const parsed = text ? safeJson(text) : {};
      if (!response.ok) {
        return {
          ok: false,
          status: response.status,
          error: describe(parsed) || `HTTP ${response.status}`,
        };
      }
      // بعضی پاسخ‌های BoxAPI `{ok:false, message}` با کد ۲۰۰ برمی‌گردانند؛
      // آن را موفق حساب نکنیم وگرنه فکر می‌کنیم پیام رسیده است.
      if (parsed && typeof parsed === 'object' && (parsed as { ok?: unknown }).ok === false) {
        return { ok: false, status: response.status, error: describe(parsed) || 'رد شد' };
      }
      return { ok: true, data: parsed as T };
    } catch (error) {
      const aborted = error instanceof Error && error.name === 'AbortError';
      return { ok: false, error: aborted ? 'زمان پاسخ BoxAPI تمام شد.' : (error instanceof Error ? error.message : 'خطای شبکه') };
    } finally {
      clearTimeout(timer);
    }
  }

  /** پیام متنی دایرکت؛ با دکمه یا پاسخ سریع اختیاری. */
  sendMessage(accountId: string, input: SendMessageInput): Promise<InstagramResult> {
    const body: Record<string, unknown> = {
      recipient_id: input.recipientId,
      message: input.message,
    };
    if (input.buttons?.length) body.buttons = input.buttons;
    if (input.quickReplies?.length) body.quick_replies = input.quickReplies;
    if (input.isEcho) body.is_echo = true;
    return this.post(accountId, 'send_message', body);
  }

  /** قالب عمومی (کارت محصول با تصویر و دکمه). */
  sendGenericTemplate(accountId: string, recipientId: string, elements: GenericTemplateElement[]): Promise<InstagramResult> {
    return this.post(accountId, 'send_generic_template', { recipient_id: recipientId, elements });
  }

  /** پیوست (فایل/تصویر) با آدرس عمومی. */
  sendAttachment(accountId: string, recipientId: string, url: string, type = 'file'): Promise<InstagramResult> {
    return this.post(accountId, 'send_attachment', { recipient_id: recipientId, attachment_type: type, url });
  }

  /** پاسخ عمومی به یک کامنت (نه دایرکت). */
  replyComment(accountId: string, commentId: string, message: string): Promise<InstagramResult> {
    return this.post(accountId, 'reply_comment', { comment_id: commentId, message });
  }

  /** فهرست گفتگوها؛ برای همگام‌سازی اولیه‌ی صندوق ورودی. */
  conversations(accountId: string, userId?: string): Promise<InstagramResult> {
    return this.post(accountId, 'conversation_conversations', userId ? { user_id: userId } : {});
  }

  /**
   * فهرست پیج‌هایی که از طریق لینک ورود اختصاصی حساب باکس‌ای‌پی لاگین شده‌اند.
   *
   * چرا این متد ستون فقرات اتصال چندفروشگاهی است: `account_id` هر پیج فقط
   * این‌جا پیدا می‌شود. فروشنده لینک ورود را باز می‌کند، پیجش را اجازه می‌دهد و
   * بعد پنل از همین فهرست پیج او را نشان می‌دهد تا انتخاب کند.
   *
   * `GET /service/accounts` (برخلاف بقیه‌ی اکشن‌ها) GET است و بدنه ندارد.
   */
  async listAccounts(): Promise<InstagramResult<InstagramAccount[]>> {
    const result = await this.request('GET', 'service/accounts');
    if (!result.ok) return result;
    return { ok: true, data: normalizeAccounts(result.data) };
  }

  /** درخواست خام (GET یا POST) با همان قواعد خطا و سقف زمان. */
  private async request<T = unknown>(method: 'GET' | 'POST', path: string, body?: Record<string, unknown>): Promise<InstagramResult<T>> {
    if (!this.configured) return { ok: false, error: 'INSTAGRAM_API_KEY ست نشده است.' };
    const url = `${this.config.baseUrl}/${path.replace(/^\/+/, '')}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      const response = await fetch(url, {
        method,
        headers: {
          accept: 'application/json',
          'x-api-key': this.config.apiKey,
          ...(body ? { 'content-type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: controller.signal,
      });
      const text = await response.text();
      const parsed = text ? safeJson(text) : {};
      if (!response.ok) return { ok: false, status: response.status, error: describe(parsed) || `HTTP ${response.status}` };
      return { ok: true, data: parsed as T };
    } catch (error) {
      const aborted = error instanceof Error && error.name === 'AbortError';
      return { ok: false, error: aborted ? 'زمان پاسخ BoxAPI تمام شد.' : (error instanceof Error ? error.message : 'خطای شبکه') };
    } finally {
      clearTimeout(timer);
    }
  }
}

/** یک پیج متصل، همان‌طور که BoxAPI برمی‌گرداند (و ما لازم داریم). */
export type InstagramAccount = {
  id: string;
  username: string;
  instagramUserId: string;
  profilePhoto: string;
  active: boolean;
  /** تاریخ انقضای دسترسی؛ بعد از آن فروشنده باید دوباره وارد شود. */
  expiresAt: string | null;
};

/**
 * پاسخ `/service/accounts` را به شکل ثابت خودمان درمی‌آورد.
 *
 * چرا: مستندات نمونه را در `data` می‌گذارد، ولی بعضی پاسخ‌ها مستقیم آرایه‌ی
 * بالا هستند یا کلید `accounts` دارند. اگر فقط یک شکل را بفهمیم، اتصال در
 * بعضی حساب‌ها «هیچ پیجی پیدا نشد» می‌دهد بدون اینکه چیزی خراب باشد.
 */
export function normalizeAccounts(payload: unknown): InstagramAccount[] {
  const list = pickList(payload);
  return list.map(item => {
    const record = (item ?? {}) as Record<string, unknown>;
    const expires = typeof record.expires_at === 'string' ? record.expires_at : '';
    return {
      id: String(record.id ?? '').trim(),
      username: String(record.username ?? '').trim(),
      instagramUserId: String(record.instagram_user_id ?? '').trim(),
      profilePhoto: String(record.profile_photo ?? '').trim(),
      // `is_active` ممکن است نباشد؛ غیبتش را «فعال» می‌خوانیم تا پیج سالم
      // به‌خاطر یک فیلد اختیاری از فهرست نیفتد.
      active: record.is_active === undefined ? true : Boolean(record.is_active),
      expiresAt: expires && !Number.isNaN(Date.parse(expires)) ? new Date(expires).toISOString() : null,
    };
  }).filter(account => account.id.length > 0);
}

function pickList(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  const record = payload as Record<string, unknown>;
  for (const key of ['data', 'accounts', 'items', 'results']) {
    const value = record[key];
    if (Array.isArray(value)) return value;
    // صفحه‌بندی تو در تو: { data: { data: [...] } }
    if (value && typeof value === 'object') {
      const nested = (value as Record<string, unknown>).data;
      if (Array.isArray(nested)) return nested;
    }
  }
  return [];
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text.slice(0, 500) };
  }
}

/** پیام خطای خوانا از پاسخ BoxAPI؛ کلیدهای رایج را پوشش می‌دهد. */
function describe(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';
  const record = payload as Record<string, unknown>;
  for (const key of ['message', 'error', 'detail', 'description']) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 300);
  }
  return '';
}
