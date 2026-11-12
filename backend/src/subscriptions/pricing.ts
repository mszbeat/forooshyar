/**
 * منطق قیمت‌گذاری اشتراک — تنها منبع حقیقت مبلغ.
 *
 * کلاینت فقط برای نمایش از همین توابع استفاده می‌کند؛ مبلغ نهایی همیشه سمت
 * سرور با `quotePrice` محاسبه می‌شود تا دست‌کاری مبلغ در مرورگر بی‌اثر باشد.
 *
 * قیمت‌ها «مقادیر نمونه»‌اند و باید توسط ادمین در پنل `/admin/plans` تنظیم
 * شوند؛ هیچ قیمت نهایی‌ای در کد هاردکد نشده است.
 */

/** تخفیف مدت: هرچه مدت بیشتر، درصد بیشتر (روی مبلغ پایه‌ی پلن). */
export const DURATION_DISCOUNTS: { minMonths: number; percent: number }[] = [
  { minMonths: 12, percent: 20 },
  { minMonths: 6, percent: 15 },
  { minMonths: 3, percent: 10 },
];

export function durationDiscountPercent(months: number): number {
  for (const tier of DURATION_DISCOUNTS) {
    if (months >= tier.minMonths) return tier.percent;
  }
  return 0;
}

/**
 * قیمت هر پیج اینستاگرام اضافه در ماه (تومان).
 * هر پیج اینستاگرام هزینه‌ی واقعی سمت ارائه‌دهنده دارد؛ تلگرام/بله رایگان‌اند.
 * از env قابل تنظیم است تا بدون تغییر کد عوض شود.
 */
export function instagramAddonMonthlyPrice(): number {
  const raw = Number(process.env.INSTAGRAM_ADDON_PRICE ?? 250000);
  return Number.isSafeInteger(raw) && raw >= 0 ? raw : 250000;
}

export type QuoteInput = {
  monthlyPrice: number;
  months: number;
  extraInstagram: number;
  discountPercent?: number;
};

export type Quote = {
  monthly: number;
  addonMonthly: number;
  subtotal: number;
  durationDiscountPercent: number;
  durationDiscountAmount: number;
  codeDiscountPercent: number;
  codeDiscountAmount: number;
  total: number;
  savings: number;
};

/** محاسبه‌ی کامل مبلغ یک خرید؛ همه‌ی مبالغ تومان و عدد صحیح. */
export function quotePrice(input: QuoteInput): Quote {
  const months = Math.min(18, Math.max(1, Math.floor(input.months) || 1));
  const extra = Math.max(0, Math.floor(input.extraInstagram) || 0);
  const monthly = Math.max(0, Math.floor(input.monthlyPrice) || 0);
  const addonMonthly = instagramAddonMonthlyPrice() * extra;
  const perMonth = monthly + addonMonthly;
  const subtotal = perMonth * months;

  const durationPercent = durationDiscountPercent(months);
  const durationAmount = Math.floor((subtotal * durationPercent) / 100);
  const afterDuration = subtotal - durationAmount;

  const codePercent = Math.min(90, Math.max(0, Math.floor(input.discountPercent ?? 0) || 0));
  const codeAmount = Math.floor((afterDuration * codePercent) / 100);
  const total = afterDuration - codeAmount;

  return {
    monthly: perMonth,
    addonMonthly,
    subtotal,
    durationDiscountPercent: durationPercent,
    durationDiscountAmount: durationAmount,
    codeDiscountPercent: codePercent,
    codeDiscountAmount: codeAmount,
    total,
    savings: durationAmount + codeAmount,
  };
}

/** تاریخ پایان اشتراک از روی تاریخ شروع + مدت (میلادی؛ نمایش شمسی در کلاینت). */
export function endsAtFrom(startsAt: Date, months: number): Date {
  const endsAt = new Date(startsAt);
  endsAt.setMonth(endsAt.getMonth() + months);
  return endsAt;
}
