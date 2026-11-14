/**
 * آداپتورهای پیام‌رسان‌های ایرانی (بله و روبیکا).
 *
 * هر دو بر پایه‌ی Bot API کار می‌کنند و قراردادشان شبیه تلگرام است:
 *  - بله: `https://tapi.bale.ai/bot<token>/sendMessage` و webhook با
 *    `update_id` (مستندات: https://docs.bale.ai).
 *  - روبیکا: بات روبیکا از طریق `https://botapi.rubika.ir` با متدهای
 *    `sendMessage`/`getUpdates` کار می‌کند (مستندات: https://rubika.ir/bot).
 *
 * این آداپتورها عمداً کم‌ضخامت‌اند: فقط ارسال پیام و نرمال‌سازی ورودی.
 * منطق پاسخ‌گویی (مغز بات) در سرویس‌های کانال می‌ماند.
 */
import { timingSafeEqual } from 'crypto';

export interface IncomingMessage {
  platform: 'BALE' | 'RUBIKA';
  chatId: string;
  text: string;
  senderName: string;
  senderUsername: string;
  updateId?: string;
  /** کد start که در Rubika داخل aux_data.start_id می‌آید. */
  startCode?: string;
  hasPhoto: boolean;
}

export interface OutgoingMessage {
  chatId: string;
  text: string;
  parseMode?: 'HTML' | 'Markdown';
}

export type AdapterResult = { ok: true } | { ok: false; error: string };

/**
 * بررسی سکرت webhook با مقایسه‌ی زمان‌ثابت (مثل کنترلر webhook تلگرام).
 * خالص و تست‌پذیر است؛ هیچ‌وقت خود سکرت را لاگ نمی‌کنیم.
 */
export function verifyWebhookSecret(expected: string, provided: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  return a.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}

/**
 * استخراج کد فروشگاه از متن شروع بات: `/start <code>` (مثل لینک تلگرام
 * `t.me/<bot>?start=<code>`). بات مشترک است، پس بدون کد نمی‌دانیم پیام
 * مال کدام فروشگاه است.
 */
export function extractShopCode(text: string): string {
  const match = /^\s*\/?start\s+([A-Za-z0-9_-]{4,64})\s*$/i.exec(text ?? '');
  return match ? match[1] : '';
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export class BaleAdapter {
  constructor(private readonly token: string) {}

  get configured(): boolean {
    return this.token.length > 0;
  }

  private url(method: string): string {
    return `https://tapi.bale.ai/bot${this.token}/${method}`;
  }

  async send(message: OutgoingMessage): Promise<AdapterResult> {
    if (!this.configured) return { ok: false, error: 'توکن بات بله تنظیم نشده است.' };
    try {
      const response = await fetch(this.url('sendMessage'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          chat_id: message.chatId,
          text: message.parseMode === 'HTML' ? message.text : escapeHtml(message.text),
          parse_mode: message.parseMode === 'HTML' ? 'HTML' : undefined,
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) return { ok: false, error: `بله پاسخ ${response.status} داد.` };
      const payload = (await response.json().catch(() => null)) as { ok?: boolean; description?: string } | null;
      if (payload && payload.ok === false) return { ok: false, error: payload.description ?? 'ارسال ناموفق بود.' };
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'خطای شبکه' };
    }
  }

  /** نرمال‌سازی update بله به IncomingMessage. */
  static normalize(update: unknown): IncomingMessage | null {
    const root = (update ?? {}) as Record<string, unknown>;
    const message = (root.message ?? root.edited_message ?? {}) as Record<string, unknown>;
    const chat = (message.chat ?? {}) as Record<string, unknown>;
    const from = (message.from ?? {}) as Record<string, unknown>;
    const chatId = String(chat.id ?? '');
    if (!chatId) return null;
    const text = String(message.text ?? message.caption ?? '').trim();
    return {
      platform: 'BALE',
      chatId,
      text,
      senderName: String(from.first_name ?? '').trim(),
      senderUsername: String(from.username ?? '').trim(),
      updateId: root.update_id != null ? String(root.update_id) : undefined,
      hasPhoto: Boolean(message.photo),
    };
  }
}

export class RubikaAdapter {
  constructor(private readonly token: string) {}

  get configured(): boolean {
    return this.token.length > 0;
  }

  private url(method: string): string {
    return `https://botapi.rubika.ir/v3/${encodeURIComponent(this.token)}/${method}`;
  }

  async send(message: OutgoingMessage): Promise<AdapterResult> {
    if (!this.configured) return { ok: false, error: 'توکن بات روبیکا تنظیم نشده است.' };
    try {
      const response = await fetch(this.url('sendMessage'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: message.chatId, text: message.text }),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) return { ok: false, error: `روبیکا پاسخ ${response.status} داد.` };
      const payload = (await response.json().catch(() => null)) as { status?: string; message?: string; error?: string } | null;
      if (payload?.status && payload.status.toUpperCase() !== 'OK') {
        return { ok: false, error: payload.message ?? payload.error ?? 'روبیکا ارسال پیام را نپذیرفت.' };
      }
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'خطای شبکه' };
    }
  }

  /** نرمال‌سازی ساختار رسمی update روبیکا به IncomingMessage. */
  static normalize(input: unknown): IncomingMessage | null {
    const root = (input ?? {}) as Record<string, unknown>;
    const update = (root.update ?? root) as Record<string, unknown>;
    const message = (update.new_message ?? update.message ?? root.message ?? update) as Record<string, unknown>;
    const chat = (message.chat ?? {}) as Record<string, unknown>;
    const sender = (message.sender ?? {}) as Record<string, unknown>;
    const aux = (message.aux_data ?? update.aux_data ?? {}) as Record<string, unknown>;
    const chatId = String(update.chat_id ?? chat.chat_id ?? chat.id ?? message.chat_id ?? '');
    if (!chatId) return null;
    const startCode = String(aux.start_id ?? update.start_id ?? '').trim();
    const text = String(message.text ?? '').trim() || (startCode ? `/start ${startCode}` : '');
    const senderId = String(message.sender_id ?? sender.user_id ?? sender.id ?? '').trim();
    return {
      platform: 'RUBIKA',
      chatId,
      text,
      senderName: String(sender.first_name ?? sender.name ?? '').trim(),
      // Rubika sender_id یک شناسه است، نه username؛ آن را در فیلد نام کاربری ذخیره نکن.
      senderUsername: String(sender.username ?? '').trim(),
      updateId: root.update_id != null ? String(root.update_id) : update.update_id != null ? String(update.update_id) : undefined,
      startCode: startCode || undefined,
      hasPhoto: Boolean(message.file),
    };
  }
}
