/**
 * رمزنگاری شماره کارت (AES-256-GCM).
 *
 * شماره کارت داده‌ی حساس است: هرگز plaintext در DB/لاگ نمی‌نشیند.
 * کلید از `CARD_ENCRYPTION_KEY` (base64 از ۳۲ بایت) می‌آید؛ اگر ست نشده
 * باشد، در محیط توسعه از کلید ثابتِ ناامن استفاده می‌شود و هشدار داده
 * می‌شود (در production باید حتماً ست شود).
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const DEV_KEY = Buffer.alloc(32, 0x2a);

function key(): Buffer {
  const raw = (process.env.CARD_ENCRYPTION_KEY ?? '').trim();
  if (!raw) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('CARD_ENCRYPTION_KEY must be set in production');
    }
    return DEV_KEY;
  }
  const decoded = Buffer.from(raw, 'base64');
  if (decoded.length !== 32) {
    throw new Error('CARD_ENCRYPTION_KEY must be base64 of 32 bytes');
  }
  return decoded;
}

export function encryptCard(cardNumber: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const ciphertext = Buffer.concat([cipher.update(cardNumber, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join('.');
}

export function decryptCard(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split('.');
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

/** اعتبارسنجی شماره کارت ایرانی: ۱۶ رقم + Luhn. */
export function isValidCardNumber(raw: string): boolean {
  const digits = raw.replace(/[\s-]/g, '');
  if (!/^\d{16}$/.test(digits)) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

/** ماسک نمایشی: «**** **** **** 1234» */
export function maskCard(cardNumber: string): string {
  const digits = cardNumber.replace(/\D/g, '');
  return `**** **** **** ${digits.slice(-4)}`;
}
