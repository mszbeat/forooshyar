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
  /** Provider-specific uploaded image identifier for receipt vision processing. */
  photoFileId?: string;
}

export interface OutgoingButton { text: string; data?: string; url?: string }
export interface OutgoingMessage {
  chatId: string;
  text: string;
  parseMode?: 'HTML' | 'Markdown';
  buttons?: OutgoingButton[][];
}

export type AdapterResult = { ok: true } | { ok: false; error: string };

/** Normalize native inline-button click updates from Bale and Rubika. */
export function extractButtonClick(platform: 'BALE' | 'RUBIKA', input: unknown): { chatId: string; data: string; updateId?: string } | null {
  const root = (input ?? {}) as Record<string, unknown>;
  const update = (root.update ?? root) as Record<string, unknown>;
  if (platform === 'BALE') {
    const callback = (root.callback_query ?? update.callback_query ?? {}) as Record<string, unknown>;
    const msg = (callback.message ?? {}) as Record<string, unknown>;
    const chat = (msg.chat ?? {}) as Record<string, unknown>;
    const chatId = String(chat.id ?? '');
    const data = String(callback.data ?? '');
    return chatId && data ? { chatId, data, updateId: root.update_id != null ? String(root.update_id) : undefined } : null;
  }
  const inline = (update.inline_message ?? root.inline_message ?? {}) as Record<string, unknown>;
  const aux = (inline.aux_data ?? {}) as Record<string, unknown>;
  const chatId = String(inline.chat_id ?? update.chat_id ?? '');
  const data = String(aux.button_id ?? inline.button_id ?? '');
  return chatId && data ? { chatId, data, updateId: root.update_id != null ? String(root.update_id) : update.update_id != null ? String(update.update_id) : undefined } : null;
}

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

function decodeHtml(value: string): string {
  let text = value;
  for (let i = 0; i < 3; i += 1) {
    const decoded = text.replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"')
      .replace(/&#39;|&apos;/gi, "'").replace(/&amp;/gi, '&');
    if (decoded === text) break;
    text = decoded;
  }
  return text;
}

function plainText(value: string): string {
  // API wrappers may escape HTML once or twice; decode before stripping formatting.
  return decodeHtml(value).replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(?:b|i|u|s|code|pre|a)\b[^>]*\/?\s*>/gi, '')
    .replace(/:white_check_mark:/gi, '✅').replace(/:point_down:/gi, '👇')
    .replace(/:moneybag:/gi, '💰').replace(/:warning:/gi, '⚠️');
}


function largestPhotoId(value: unknown): string | undefined {
  if (!Array.isArray(value)) return undefined;
  const photo = [...value].sort((a, b) => Number((b as Record<string, unknown>).file_size ?? 0) - Number((a as Record<string, unknown>).file_size ?? 0)).at(0) as Record<string, unknown> | undefined;
  return photo?.file_id ? String(photo.file_id) : undefined;
}

export type DownloadedImage = { buffer: Buffer; mimeType: 'image/jpeg' | 'image/png' | 'image/webp' };

async function readImage(url: string): Promise<DownloadedImage> {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:') throw new Error('آدرس فایل تصویر امن نیست.');
  const response = await fetch(parsed, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`دریافت تصویر از پیام‌رسان ناموفق بود (${response.status}).`);
  const declaredMime = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  if (declaredMime && !['image/jpeg', 'image/png', 'image/webp', 'application/octet-stream', 'binary/octet-stream'].includes(declaredMime)) throw new Error('رسید باید تصویر JPEG، PNG یا WebP باشد.');
  const declaredSize = Number(response.headers.get('content-length') ?? 0);
  if (declaredSize > 5 * 1024 * 1024) throw new Error('حجم تصویر رسید بیش از ۵ مگابایت است.');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('محتوای تصویر رسید خالی است.');
  const chunks: Buffer[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > 5 * 1024 * 1024) {
      await reader.cancel();
      throw new Error('حجم تصویر رسید باید کمتر از ۵ مگابایت باشد.');
    }
    chunks.push(Buffer.from(value));
  }
  if (total === 0) throw new Error('محتوای تصویر رسید خالی است.');
  const buffer = Buffer.concat(chunks, total);
  const mimeType: DownloadedImage['mimeType'] | undefined = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
    ? 'image/jpeg'
    : buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
      ? 'image/png'
      : buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP'
        ? 'image/webp'
        : undefined;
  if (!mimeType || (declaredMime.startsWith('image/') && declaredMime !== mimeType)) throw new Error('محتوای فایل دریافتی تصویر معتبر JPEG، PNG یا WebP نیست.');
  return { buffer, mimeType };
}

export class BaleAdapter {
  constructor(private readonly token: string) {}

  get configured(): boolean {
    return this.token.length > 0;
  }

  private url(method: string): string {
    return `https://tapi.bale.ai/bot${this.token}/${method}`;
  }

  async downloadPhoto(fileId: string): Promise<DownloadedImage> {
    const response = await fetch(this.url('getFile'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ file_id: fileId }), signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(`بله فایل رسید را پیدا نکرد (${response.status}).`);
    const payload = await response.json() as { ok?: boolean; result?: { file_path?: string } };
    const path = payload.result?.file_path;
    if (!payload.ok || !path || path.startsWith('/') || path.includes('..')) throw new Error('مسیر دانلود رسید از بله معتبر نیست.');
    return readImage(`https://tapi.bale.ai/file/bot${this.token}/${path}`);
  }

  async send(message: OutgoingMessage): Promise<AdapterResult> {
    if (!this.configured) return { ok: false, error: 'توکن بات بله تنظیم نشده است.' };
    try {
      const response = await fetch(this.url('sendMessage'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          chat_id: message.chatId,
          // Bale clients/providers have rendered HTML tags literally in real
          // chats despite parse_mode; send normalized plain text to guarantee
          // customers never see markup tokens.
          text: plainText(message.text).replace(/:white_check_mark:/gi, '✅').replace(/:point_down:/gi, '👇'),
          ...(message.buttons?.length ? { reply_markup: { inline_keyboard: message.buttons.map(row => row.map(button => button.url
            ? { text: button.text, url: button.url }
            : { text: button.text, callback_data: button.data ?? '' })) } } : {}),
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
      hasPhoto: (Array.isArray(message.photo) && message.photo.length > 0) || Boolean(message.document && String((message.document as Record<string, unknown>).mime_type ?? '').startsWith('image/')),
      photoFileId: largestPhotoId(message.photo) ?? (String(((message.document ?? {}) as Record<string, unknown>).file_id ?? '') || undefined),
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

  async downloadPhoto(fileId: string): Promise<DownloadedImage> {
    const response = await fetch(this.url('getFile'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ file_id: fileId }), signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(`روبیکا فایل رسید را پیدا نکرد (${response.status}).`);
    const payload = await response.json() as { status?: string; data?: { download_url?: string }; download_url?: string };
    const downloadUrl = payload.data?.download_url ?? payload.download_url;
    if (payload.status && payload.status.toUpperCase() !== 'OK' || !downloadUrl) throw new Error('روبیکا لینک دانلود رسید را برنگرداند.');
    return readImage(downloadUrl);
  }

  async send(message: OutgoingMessage): Promise<AdapterResult> {
    if (!this.configured) return { ok: false, error: 'توکن بات روبیکا تنظیم نشده است.' };
    try {
      const response = await fetch(this.url('sendMessage'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          chat_id: message.chatId,
          text: message.parseMode === 'HTML' ? plainText(message.text) : message.text,
          ...(message.buttons?.length ? { inline_keypad: { rows: message.buttons.map(row => ({ buttons: row.map(button => ({
            id: button.data ?? button.url ?? '', type: button.url ? 'Link' : 'Simple', button_text: button.text,
            ...(button.url ? { url: button.url } : {}),
          })) })) } } : {}),
        }),
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
      hasPhoto: Boolean(message.file && (String((message.file as Record<string, unknown>).type ?? '').toLowerCase() === 'image' || /\.(png|jpe?g|webp|gif)$/i.test(String((message.file as Record<string, unknown>).file_name ?? '')))),
      photoFileId: String(((message.file ?? {}) as Record<string, unknown>).file_id ?? '') || undefined,
    };
  }
}
