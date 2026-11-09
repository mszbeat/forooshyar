import { createHmac, timingSafeEqual } from 'crypto';

/**
 * بررسی امضای webhook باکس‌ای‌پی.
 *
 * چرا این‌جا و نه در کنترلر: این تابع تنها جای منطق امنیتی است، پس باید
 * جدا و مستقل تست شود. اشتباه در همین ۲۰ خط یعنی هر کسی می‌تواند پیام جعلی
 * «سفارش» به بات بفرستد.
 *
 * قرارداد BoxAPI (مطابق مستندات):
 *   signed_payload = `${X-BoxApi-Timestamp}.${rawBody}`   ← بدنه‌ی **خام**
 *   signature      = `sha256=` + hex(HMAC_SHA256(signed_payload, secret))
 *   timestamp      = فقط رقم، حداکثر ۳۰۰ ثانیه اختلاف با ساعت سرور
 *
 * نکته‌ی مهم: بدنه باید همان بایت‌هایی باشد که روی سیم آمده. اگر JSON را
 * دوباره سریالایز کنیم (ترتیب کلیدها/فاصله‌ها/Final Unicode) امضا هر بار
 * رد می‌شود — همین اشتباه باعث می‌شود «همه‌ی درخواست‌ها ۴۰۱» بگیرند و
 * در نهایت BoxAPI رویداد را دور بیندازد.
 */

export type SignatureCheck =
  | { ok: true; enforced: boolean }
  | { ok: false; reason: 'missing_signature' | 'bad_timestamp' | 'stale_timestamp' | 'mismatch' };

export type VerifyInput = {
  /** بدنه‌ی خام درخواست (Buffer یا رشته‌ی UTF-8). */
  rawBody: Buffer | string;
  /** مقدار هدر `X-BoxApi-Signature`. */
  signature?: string;
  /** مقدار هدر `X-BoxApi-Timestamp`. */
  timestamp?: string;
  secret: string;
  /** برای تست: زمان فعلی به میلی‌ثانیه. */
  nowMs?: number;
  /** پنجره‌ی مجاز؛ مستندات ۳۰۰ ثانیه. */
  windowSec?: number;
};

export function signPayload(secret: string, timestamp: string, rawBody: Buffer | string): string {
  const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, 'utf8');
  const mac = createHmac('sha256', secret)
    .update(Buffer.concat([Buffer.from(`${timestamp}.`, 'utf8'), body]))
    .digest('hex');
  return `sha256=${mac}`;
}

export function verifySignature(input: VerifyInput): SignatureCheck {
  const secret = (input.secret ?? '').trim();
  // سکرت خالی = امضا غیرفعال (کاربر هنوز سکرت را در env نگذاشته). این حالت را
  // «enforced: false» برمی‌گردانیم تا کنترلر بتواند در لاگ هشدار بدهد.
  if (!secret) return { ok: true, enforced: false };

  const signature = (input.signature ?? '').trim();
  if (!signature) return { ok: false, reason: 'missing_signature' };

  const timestamp = (input.timestamp ?? '').trim();
  if (!/^\d{1,15}$/.test(timestamp)) return { ok: false, reason: 'bad_timestamp' };

  const windowSec = input.windowSec ?? 300;
  const nowSec = Math.floor((input.nowMs ?? Date.now()) / 1000);
  if (Math.abs(nowSec - Number(timestamp)) > windowSec) return { ok: false, reason: 'stale_timestamp' };

  const expected = signPayload(secret, timestamp, input.rawBody);
  const left = Buffer.from(expected, 'utf8');
  const right = Buffer.from(signature, 'utf8');
  // مقایسه‌ی زمان‌ثابت؛ طول نابرابر هم باید بی‌صدا رد شود نه throw.
  if (left.length !== right.length) return { ok: false, reason: 'mismatch' };
  return timingSafeEqual(left, right) ? { ok: true, enforced: true } : { ok: false, reason: 'mismatch' };
}
