/**
 * تولید ترکیب واریانت‌ها از ویژگی‌های محصول (ضرب دکارتی).
 *
 * این ماژول خالص است (بدون Prisma) تا تست‌پذیر باشد و در سرویس کاتالوگ
 * و ایمپورت استفاده شود. قانون‌های کلیدی:
 *  - سقف ۲۰۰ ترکیب در هر محصول.
 *  - بازتولید، diff می‌گیرد: ترکیب‌های موجود دست نمی‌خورند (قیمت/موجودی
 *    ویرایش‌شده حفظ می‌شود)، ترکیب‌های جدید با پیش‌فرض محصول ساخته می‌شوند
 *    و ترکیب‌های حذف‌شده غیرفعال می‌شوند (نه اینکه حذف فیزیکی شوند).
 */

export const MAX_VARIANT_COMBINATIONS = 200;

export interface AttributeOption {
  name: string;
  values: string[];
}

export interface Combination {
  /** نگاشت نام ویژگی به مقدار انتخاب‌شده، مثل { "رنگ": "مشکی", "سایز": "M" } */
  options: Record<string, string>;
  /** کلید پایدار ترکیب برای diff (مرتب‌سازی بر اساس نام ویژگی). */
  key: string;
}

export function combinationKey(options: Record<string, string>): string {
  return Object.keys(options)
    .sort()
    .map((name) => `${name}=${options[name]}`)
    .join('|');
}

/**
 * ضرب دکارتی ویژگی‌ها. ویژگی بدون مقدار نادیده گرفته می‌شود.
 * اگر محصول هیچ ویژگی‌ای نداشته باشد، یک ترکیب خالی برمی‌گرداند
 * (واریانت تکی بدون گزینه).
 */
export function generateCombinations(
  attributes: AttributeOption[],
): Combination[] {
  const usable = attributes.filter((a) => a.values.length > 0);
  if (usable.length === 0) return [{ options: {}, key: '' }];

  let combos: Record<string, string>[] = [{}];
  for (const attr of usable) {
    const next: Record<string, string>[] = [];
    for (const base of combos) {
      for (const value of attr.values) {
        next.push({ ...base, [attr.name]: value });
      }
    }
    combos = next;
    if (combos.length > MAX_VARIANT_COMBINATIONS) {
      throw new Error(
        `تعداد ترکیب‌ها از سقف ${MAX_VARIANT_COMBINATIONS} گذشت؛ ` +
          'تعداد مقادیر ویژگی‌ها را کم کنید.',
      );
    }
  }
  return combos.map((options) => ({ options, key: combinationKey(options) }));
}

export interface ExistingVariantLike {
  options: Record<string, string>;
  active: boolean;
}

export interface CombinationDiff {
  /** ترکیب‌هایی که باید ساخته شوند (با پیش‌فرض محصول). */
  toCreate: Combination[];
  /** ترکیب‌هایی که از قبل هستند و دست نمی‌خورند. */
  toKeep: Combination[];
  /** ترکیب‌های موجودی که دیگر در ویژگی‌ها نیستند (غیرفعال می‌شوند). */
  toDeactivate: Combination[];
}

/**
 * diff بین ترکیب‌های موجود و ترکیب‌های تازه‌تولیدشده.
 * ترکیب‌های موجود (حتی غیرفعال) حفظ می‌شوند تا ویرایش‌های فروشنده
 * و تاریخچه‌ی سفارش‌ها از بین نرود.
 */
export function diffCombinations(
  existing: ExistingVariantLike[],
  generated: Combination[],
): CombinationDiff {
  const generatedKeys = new Set(generated.map((c) => c.key));
  const existingKeys = new Set(existing.map((v) => combinationKey(v.options)));

  const toCreate = generated.filter((c) => !existingKeys.has(c.key));
  const toKeep = generated.filter((c) => existingKeys.has(c.key));
  const toDeactivate = existing
    .filter((v) => v.active && !generatedKeys.has(combinationKey(v.options)))
    .map((v) => ({ options: v.options, key: combinationKey(v.options) }));

  return { toCreate, toKeep, toDeactivate };
}

/** استخراج مقدار «سایز»/«رنگ» از گزینه‌ها برای همگام‌سازی فیلدهای قدیمی. */
export function sizeColorFromOptions(options: Record<string, string>): {
  size: string;
  color: string;
} {
  return { size: options['سایز'] ?? '', color: options['رنگ'] ?? '' };
}
