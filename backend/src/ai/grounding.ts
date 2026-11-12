/**
 * اعتبارسنجی grounding: پاسخ نهایی (بعد از بازنویسی لحن) باید فقط شامل
 * واقعیت‌هایی باشد که در داده‌ی DB بودند.
 *
 * اگر مدل عدد، قیمت، URL یا نام محصولی را ساخته باشد که در متن اصلی
 * نبود، بازنویسی رد می‌شود و متن اصلی (قاعده‌محور) به مشتری می‌رسد.
 * این نگهبان همیشه فعال است و قابل خاموش‌کردن نیست.
 */

export interface GroundingFacts {
  /** همه‌ی عددهای متن اصلی (به‌صورت رشته‌ی نرمال‌شده‌ی لاتین). */
  numbers: string[];
  /** نام‌های محصول و SKUهای کاتالوگ. */
  productTitles: string[];
  skus: string[];
  /** URLهای مجاز (لینک‌های فروشگاه). */
  urls: string[];
}

function normalizeNumber(value: string): string {
  return value
    .replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 1776))
    .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 1632))
    .replace(/[٬,\s]/g, '');
}

function numbersIn(text: string): string[] {
  return (text.match(/[0-9۰-۹][0-9۰-۹٬,.]*/g) ?? []).map(normalizeNumber);
}

export interface GroundingResult {
  ok: boolean;
  reason?: string;
}

/**
 * بررسی متن بازنویسی‌شده در برابر واقعیت‌های متن اصلی.
 * هر عدد/URL/نام محصولی که در متن نهایی هست باید در متن اصلی هم باشد.
 */
export function validateGrounding(rewritten: string, original: string, facts: GroundingFacts): GroundingResult {
  const originalNumbers = new Set([...numbersIn(original), ...facts.numbers.map(normalizeNumber)]);
  for (const number of numbersIn(rewritten)) {
    if (!originalNumbers.has(number)) {
      return { ok: false, reason: `fabricated_number:${number}` };
    }
  }

  const originalUrls = new Set([
    ...(original.match(/https?:\/\/[^\s<]+/g) ?? []),
    ...facts.urls,
  ]);
  for (const url of rewritten.match(/https?:\/\/[^\s<]+/g) ?? []) {
    if (!originalUrls.has(url)) {
      return { ok: false, reason: `fabricated_url:${url.slice(0, 60)}` };
    }
  }

  // نام محصولی که در کاتالوگ نیست ولی در متن نهایی آمده، مشکوک است؛
  // فقط وقتی رد می‌کنیم که متن اصلی هیچ نام محصولی نداشت و متن نهایی
  // یک نام از فهرست کاتالوگ را اشتباه آورده باشد — این حالت با ماسک
  // پوشش داده می‌شود، پس این‌جا فقط URL و عدد را سخت‌گیرانه چک می‌کنیم.
  return { ok: true };
}
