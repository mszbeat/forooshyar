/**
 * وریفای رسید پرداخت کارت‌به‌کارت.
 *
 * دو لایه:
 *  ۱. استخراج با مدل بینایی (JSON سخت‌گیرانه، Appendix A5) — فقط خواندن،
 *     بدون هیچ تصمیمی.
 *  ۲. چک‌های قطعی در کد: مبلغ (با پشتیبانی ریال=تومان×۱۰)، مقصد، پنجره‌ی
 *     زمانی، یکتایی شماره پیگیری. حکم نهایی از همین چک‌ها ساخته می‌شود،
 *     نه از نظر مدل.
 */

export interface ExtractedReceipt {
  amount?: number | null;
  amountCurrency?: 'toman' | 'rial' | 'unknown';
  destinationCardLast4?: string | null;
  destinationHolder?: string | null;
  sourceCardLast4?: string | null;
  trackingCode?: string | null;
  dateTime?: string | null;
  bank?: string | null;
  readable: boolean;
}

export interface ReceiptCheck {
  check: string;
  ok: boolean;
  detail: string;
}

export interface VerifyInput {
  expectedTotal: number;
  /** چهار رقم آخر کارت‌های فعال فروشگاه. */
  destinationLast4s: string[];
  /** نام دارنده‌های کارت‌های فعال (برای تطبیق تقریبی). */
  destinationHolders: string[];
  /** شماره پیگیری‌هایی که قبلاً برای این فروشگاه ثبت شده‌اند. */
  usedTrackingCodes: string[];
  /** زمان ثبت سفارش (برای پنجره‌ی زمانی). */
  orderCreatedAt: Date;
  now?: Date;
  /** حداکثر فاصله‌ی مجاز رسید از ثبت سفارش (ساعت). */
  maxAgeHours?: number;
}

export interface VerifyResult {
  verdict: 'CONFIRMED' | 'NEEDS_REVIEW' | 'REJECTED';
  checks: ReceiptCheck[];
  reason: string;
}

/** نرمال‌سازی اعداد فارسی/عربی و جداکننده‌ها. */
export function normalizeDigits(value: string): string {
  return value
    .replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 1776))
    .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 1632))
    .replace(/[٬,\s]/g, '');
}

function last4Of(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = normalizeDigits(value).replace(/\D/g, '');
  return digits.length >= 4 ? digits.slice(-4) : null;
}

/**
 * چک‌های قطعی روی رسید استخراج‌شده.
 * قانون حکم:
 *  - مبلغ اشتباه یا مقصد اشتباه (و خوانا) → REJECTED
 *  - رسید ناخوانا، شماره پیگیری تکراری، خارج از پنجره‌ی زمانی، یا
 *    نبود اطلاعات کافی → NEEDS_REVIEW
 *  - همه‌ی چک‌ها سبز → CONFIRMED (مشروط به سیاست تأیید خودکار فروشگاه)
 */
export function verifyReceipt(extracted: ExtractedReceipt, input: VerifyInput): VerifyResult {
  const checks: ReceiptCheck[] = [];
  const now = input.now ?? new Date();
  const maxAgeHours = input.maxAgeHours ?? 72;

  if (!extracted.readable) {
    checks.push({ check: 'readable', ok: false, detail: 'رسید خوانا نیست؛ بررسی دستی لازم است.' });
    return { verdict: 'NEEDS_REVIEW', checks, reason: 'رسید خوانا نیست و باید دستی بررسی شود.' };
  }

  // --- مبلغ (با پشتیبانی ریال/تومان) ---
  let amountOk: boolean | null = null;
  if (extracted.amount != null && Number.isFinite(extracted.amount)) {
    const amount = Math.round(extracted.amount);
    const asToman = extracted.amountCurrency === 'rial' ? Math.round(amount / 10) : amount;
    const asRial = extracted.amountCurrency === 'toman' ? amount * 10 : amount;
    amountOk =
      asToman === input.expectedTotal ||
      asRial === input.expectedTotal ||
      amount === input.expectedTotal;
    checks.push({
      check: 'amount',
      ok: amountOk,
      detail: amountOk
        ? 'مبلغ رسید با جمع سفارش مطابق است.'
        : `مبلغ رسید (${amount.toLocaleString('fa-IR')}) با مبلغ سفارش (${input.expectedTotal.toLocaleString('fa-IR')}) نمی‌خواند.`,
    });
  } else {
    checks.push({ check: 'amount', ok: false, detail: 'مبلغ در رسید پیدا نشد.' });
  }

  // --- مقصد (کارت فروشگاه) ---
  let destinationOk: boolean | null = null;
  const destLast4 = last4Of(extracted.destinationCardLast4);
  if (destLast4) {
    destinationOk = input.destinationLast4s.includes(destLast4);
    checks.push({
      check: 'destination',
      ok: destinationOk,
      detail: destinationOk
        ? 'کارت مقصد با کارت فروشگاه مطابق است.'
        : `کارت مقصد (…${destLast4}) با کارت‌های فروشگاه نمی‌خواند.`,
    });
  } else {
    checks.push({ check: 'destination', ok: false, detail: 'کارت مقصد در رسید پیدا نشد.' });
  }

  // --- یکتایی شماره پیگیری ---
  let trackingOk: boolean | null = null;
  const tracking = extracted.trackingCode ? normalizeDigits(extracted.trackingCode).trim() : '';
  if (tracking) {
    trackingOk = !input.usedTrackingCodes.some((used) => normalizeDigits(used) === tracking);
    checks.push({
      check: 'tracking_unique',
      ok: trackingOk,
      detail: trackingOk
        ? 'شماره پیگیری قبلاً استفاده نشده است.'
        : 'این شماره پیگیری قبلاً برای سفارش دیگری ثبت شده است.',
    });
  } else {
    checks.push({ check: 'tracking_unique', ok: false, detail: 'شماره پیگیری در رسید پیدا نشد.' });
  }

  // --- پنجره‌ی زمانی ---
  let timeOk: boolean | null = null;
  if (extracted.dateTime) {
    const parsed = new Date(extracted.dateTime);
    if (!Number.isNaN(parsed.getTime())) {
      const ageHours = (now.getTime() - parsed.getTime()) / 3_600_000;
      timeOk = ageHours >= -1 && ageHours <= maxAgeHours;
      checks.push({
        check: 'time_window',
        ok: timeOk,
        detail: timeOk
          ? 'زمان رسید در پنجره‌ی مجاز است.'
          : 'زمان رسید خارج از پنجره‌ی مجاز است.',
      });
    } else {
      checks.push({ check: 'time_window', ok: false, detail: 'زمان رسید قابل خواندن نیست.' });
    }
  } else {
    checks.push({ check: 'time_window', ok: false, detail: 'زمان در رسید پیدا نشد.' });
  }

  const hardFail = amountOk === false || destinationOk === false;
  const allOk = amountOk === true && destinationOk === true && trackingOk === true && timeOk === true;

  if (hardFail) {
    const reason = amountOk === false
      ? 'مبلغ رسید با مبلغ سفارش مطابق نیست.'
      : 'کارت مقصد با کارت فروشگاه مطابق نیست.';
    return { verdict: 'REJECTED', checks, reason };
  }
  if (allOk) {
    return { verdict: 'CONFIRMED', checks, reason: 'رسید تأیید شد: مبلغ، مقصد، شماره پیگیری و زمان همه درست‌اند.' };
  }
  return {
    verdict: 'NEEDS_REVIEW',
    checks,
    reason: 'اطلاعات رسید کامل نیست؛ فروشنده باید دستی بررسی کند.',
  };
}
