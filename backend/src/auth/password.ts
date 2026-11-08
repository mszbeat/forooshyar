import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'crypto';
import { promisify } from 'util';

/**
 * هش رمز عبور با scrypt (بدون وابستگی بیرونی).
 *
 * قالب: `<salt-hex>:<hash-hex>`. salt تصادفی ۱۶ بایتی و طول کلید ۶۴ بایت است.
 * مقایسه‌ی زمان‌ثابت انجام می‌شود تا طول عمر رمز از روی زمان پاسخ لو نرود.
 *
 * چرا اینجا و نه داخل AuthService: هم حساب فروشنده و هم حساب ادمین پلتفرم از
 * همین کد استفاده می‌کنند؛ دو نسخه‌ی جدا یعنی دو نسخه‌ی بالقوه ناسازگار.
 */
const scrypt = promisify(scryptCallback);

export async function hashPassword(password: string, salt = randomBytes(16).toString('hex')): Promise<string> {
  const key = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${key.toString('hex')}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [salt, hex] = encoded.split(':');
  if (!salt || !hex) return false;
  const key = (await scrypt(password, salt, 64)) as Buffer;
  const expected = Buffer.from(hex, 'hex');
  return expected.length === key.length && timingSafeEqual(key, expected);
}
