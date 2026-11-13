import { Injectable, Logger } from '@nestjs/common';
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../logging/audit.service';

/**
 * سرویس پیامک — درگاه sms.ir (پکیج وب‌سرویس).
 *
 * دو مسیر ارسال داریم:
 *  - پیامک متنی عادی: `POST /v1/send/bulk` با خط فرستنده‌ی `SMS_SENDER_NUMBER`
 *    (اگر خط ست نشده باشد، ارسال عادی غیرفعال می‌ماند و فقط لاگ می‌شود).
 *  - کد تأیید (OTP): `POST /v1/send/verify` با قالب تأییدشده‌ی sms.ir؛
 *    شماره‌ی قالب در `SMS_OTP_TEMPLATE_ID` و نام پارامتر در `SMS_OTP_PARAM_NAME`
 *    (پیش‌فرض `Code`) قابل تنظیم است.
 *
 * کلید API (`SMS_API_KEY` یا پنل ادمین) هرگز در لاگ/پاسخ دیده نمی‌شود.
 * اگر کلید ست نشده باشد، رفتار Mock قبلی حفظ می‌شود تا توسعه‌ی محلی نشکند.
 */

export function normalizePhone(raw: string) {
  const s = raw.trim().replace(/[\s()\-\u200c\u200f]/g, '');
  if (/^09\d{9}$/u.test(s)) return `+98${s.slice(1)}`;
  if (/^\+989\d{9}$/u.test(s)) return s;
  throw new Error('شماره موبایل معتبر نیست.');
}

/** شماره برای ارسال به sms.ir: ۰۹xxxxxxxxx */
function toLocalMobile(phone: string): string {
  return phone.startsWith('+98') ? `0${phone.slice(3)}` : phone;
}

@Injectable()
export class SmsService {
  private logger = new Logger('Sms');
  constructor(private db: PrismaService, private audit: AuditService) {}

  get enabled() { return (process.env.SMS_ENABLED ?? 'true') === 'true'; }
  get otpEnabled() { return (process.env.OTP_ENABLED ?? 'false') === 'true'; }
  private get apiKey() { return (process.env.SMS_API_KEY ?? '').trim(); }
  private get configured() { return this.apiKey.length > 0; }
  private get senderNumber() { return (process.env.SMS_SENDER_NUMBER ?? '').trim(); }
  private get otpTemplateId() { return (process.env.SMS_OTP_TEMPLATE_ID ?? '').trim(); }
  private get otpParamName() { return (process.env.SMS_OTP_PARAM_NAME ?? 'Code').trim() || 'Code'; }
  private get baseUrl() { return (process.env.SMS_API_BASE ?? 'https://api.sms.ir').replace(/\/+$/, ''); }

  private mask(phone: string) { return `${phone.slice(0, 5)}••••${phone.slice(-3)}`; }

  /** ارسال پیامک متنی عادی (bulk). */
  async send(rawPhone: string, text: string, category: string, shopId?: string, code?: string) {
    if (!this.enabled) return { sent: false as const };
    const phone = normalizePhone(rawPhone);
    if (!this.configured || !this.senderNumber) {
      this.logger.log(`[MOCK SMS] ${category} ${this.mask(phone)} chars=${text.length}${code && process.env.NODE_ENV !== 'production' ? ` code=${code}` : ''}`);
      this.audit.record({ action: 'sms.mock_sent', entity: 'sms', shopId, meta: { category, phone: this.mask(phone), chars: text.length } });
      return { sent: true as const };
    }
    try {
      const res = await fetch(`${this.baseUrl}/v1/send/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/plain', 'x-api-key': this.apiKey },
        body: JSON.stringify({ mobile: toLocalMobile(phone), templateId: 0, parameters: [], text, senderNumber: this.senderNumber }),
        signal: AbortSignal.timeout(15000),
      });
      const body = await res.text().catch(() => '');
      if (!res.ok) {
        this.logger.warn(`sms.ir bulk ناموفق (${res.status}): ${body.slice(0, 200)}`);
        this.audit.record({ action: 'sms.send_failed', entity: 'sms', shopId, meta: { category, phone: this.mask(phone), status: res.status } });
        return { sent: false as const };
      }
      this.audit.record({ action: 'sms.sent', entity: 'sms', shopId, meta: { category, phone: this.mask(phone), chars: text.length } });
      return { sent: true as const };
    } catch (error) {
      this.logger.warn(`sms.ir bulk خطا: ${error instanceof Error ? error.message : 'unknown'}`);
      return { sent: false as const };
    }
  }

  /** ارسال کد تأیید با قالب sms.ir؛ در غیاب کلید/قالب، Mock (فقط لاگ). */
  private async sendOtp(phone: string, code: string, category: string, shopId?: string) {
    if (!this.configured || !this.otpTemplateId) {
      this.logger.log(`[MOCK SMS] ${category} ${this.mask(phone)}${process.env.NODE_ENV !== 'production' ? ` code=${code}` : ''}`);
      this.audit.record({ action: 'sms.mock_sent', entity: 'sms', shopId, meta: { category, phone: this.mask(phone) } });
      return { sent: true as const };
    }
    try {
      const res = await fetch(`${this.baseUrl}/v1/send/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/plain', 'x-api-key': this.apiKey },
        body: JSON.stringify({
          mobile: toLocalMobile(phone),
          templateId: Number(this.otpTemplateId),
          parameters: [{ name: this.otpParamName, value: code }],
        }),
        signal: AbortSignal.timeout(15000),
      });
      const body = await res.text().catch(() => '');
      if (!res.ok) {
        this.logger.warn(`sms.ir verify ناموفق (${res.status}): ${body.slice(0, 200)}`);
        this.audit.record({ action: 'sms.otp_failed', entity: 'sms', shopId, meta: { category, phone: this.mask(phone), status: res.status } });
        return { sent: false as const };
      }
      this.audit.record({ action: 'sms.otp_sent', entity: 'sms', shopId, meta: { category, phone: this.mask(phone) } });
      return { sent: true as const };
    } catch (error) {
      this.logger.warn(`sms.ir verify خطا: ${error instanceof Error ? error.message : 'unknown'}`);
      return { sent: false as const };
    }
  }

  async issue(rawPhone: string, purpose: string, userId?: string) {
    if (!this.enabled || !this.otpEnabled) return { ok: false as const };
    const phone = normalizePhone(rawPhone);
    const ttl = Math.max(60, Math.min(600, Number(process.env.OTP_TTL_SECONDS) || 300));
    const code = String(randomInt(100000, 1000000));
    const hash = this.hash(code);
    await this.db.otpChallenge.updateMany({ where: { phone, purpose, consumedAt: null }, data: { consumedAt: new Date() } });
    await this.db.otpChallenge.create({ data: { phone, purpose, userId, codeHash: hash, expiresAt: new Date(Date.now() + ttl * 1000) } });
    await this.sendOtp(phone, code, 'otp');
    return { ok: true as const, expiresIn: ttl, ...(process.env.NODE_ENV !== 'production' ? { debugCode: code } : {}) };
  }

  /**
   * تأیید کد. با `consume=false` فقط پیش‌نمایش است (کد مصرف نمی‌شود) و برای
   * دکمه‌ی «تأیید شماره» در فرم ثبت‌نام استفاده می‌شود؛ مصرف نهایی در register.
   */
  async verify(rawPhone: string, code: string, purpose: string, userId?: string, consume = true) {
    const phone = normalizePhone(rawPhone);
    const row = await this.db.otpChallenge.findFirst({ where: { phone, purpose, consumedAt: null, expiresAt: { gt: new Date() }, attempts: { lt: 5 }, ...(userId ? { userId } : {}) }, orderBy: { createdAt: 'desc' } });
    if (!row) return false;
    const a = Buffer.from(this.hash(code));
    const b = Buffer.from(row.codeHash);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      await this.db.otpChallenge.update({ where: { id: row.id }, data: { attempts: { increment: 1 } } });
      return false;
    }
    if (consume) await this.db.otpChallenge.update({ where: { id: row.id }, data: { consumedAt: new Date() } });
    return true;
  }

  private hash(code: string) { return createHash('sha256').update(`${process.env.JWT_SECRET}:${code}`).digest('hex'); }
}
