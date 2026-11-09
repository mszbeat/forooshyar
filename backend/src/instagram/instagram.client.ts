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

  /** UUID پیج؛ بدون آن هیچ اکشنی معنی ندارد. */
  get accountId(): string {
    return this.config.accountId;
  }

  /** متن‌های ورودی را به مسیر اکشن BoxAPI نگاشت می‌کند. */
  private async post<T = unknown>(action: string, body: Record<string, unknown>): Promise<InstagramResult<T>> {
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
        body: JSON.stringify({ account_id: this.config.accountId, ...body }),
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
  sendMessage(input: SendMessageInput): Promise<InstagramResult> {
    const body: Record<string, unknown> = {
      recipient_id: input.recipientId,
      message: input.message,
    };
    if (input.buttons?.length) body.buttons = input.buttons;
    if (input.quickReplies?.length) body.quick_replies = input.quickReplies;
    if (input.isEcho) body.is_echo = true;
    return this.post('send_message', body);
  }

  /** قالب عمومی (کارت محصول با تصویر و دکمه). */
  sendGenericTemplate(recipientId: string, elements: GenericTemplateElement[]): Promise<InstagramResult> {
    return this.post('send_generic_template', { recipient_id: recipientId, elements });
  }

  /** پیوست (فایل/تصویر) با آدرس عمومی. */
  sendAttachment(recipientId: string, url: string, type = 'file'): Promise<InstagramResult> {
    return this.post('send_attachment', { recipient_id: recipientId, attachment_type: type, url });
  }

  /** پاسخ عمومی به یک کامنت (نه دایرکت). */
  replyComment(commentId: string, message: string): Promise<InstagramResult> {
    return this.post('reply_comment', { comment_id: commentId, message });
  }

  /** فهرست گفتگوها؛ برای همگام‌سازی اولیه‌ی صندوق ورودی. */
  conversations(userId?: string): Promise<InstagramResult> {
    return this.post('conversation_conversations', userId ? { user_id: userId } : {});
  }
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
