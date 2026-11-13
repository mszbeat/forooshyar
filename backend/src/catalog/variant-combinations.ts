/**
 * تولید ترکیب واریانت‌ها از ویژگی‌های محصول (ضرب دکارتی).
 *
 * این ماژول خالص است (بدون Prisma) تا تست‌پذیر باشد و در سرویس کاتالوگ
 * و ایمپورت استفاده شود. قانون‌های کلیدی:
 *  - سقف ۱۰۰ ترکیب در هر محصول (هشدار + سقف).
 *  - بازتولید، diff می‌گیرد: ترکیب‌های موجود دست نمی‌خورند (قیمت/موجودی
 *    ویرایش‌شده حفظ می‌شود)، ترکیب‌های جدید با پیش‌فرض محصول ساخته می‌شوند
 *    و ترکیب‌های حذف‌شده غیرفعال می‌شوند (نه اینکه حذف فیزیکی شوند).
 */

export const MAX_VARIANT_COMBINATIONS = 100;

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

export interface BatchVariantInput {
  options: Record<string, string>;
  price: number;
  stock: number;
}

export interface BatchInput {
  attributes: AttributeOption[];
  variants: BatchVariantInput[];
}

/**
 * پاک‌سازی و اعتبارسنجی ورودی «ثبت دسته‌ای واریانت‌ها» (پیش‌نویس مودال محصول).
 *
 * چرا خالص: همین قاعده‌ها هم در سرویس (قبل از نوشتن در DB) و هم در تست
 * بررسی می‌شوند. خطاها با پیام فارسی برمی‌گردند تا سرویس آن‌ها را به
 * BadRequestException تبدیل کند.
 *
 * قانون‌ها:
 *  - نام ویژگی تکراری ادغام می‌شود (اجتماع مقادیر) تا ترکیب همه‌ی حالت‌ها
 *    ساخته شود؛ حداکثر ۱۰ ویژگی.
 *  - کلیدهای هر واریانت باید زیرمجموعه‌ی نام ویژگی‌ها باشند و دست‌کم یک
 *    ویژگی داشته باشد (ترکیب جزئی هم مجاز است، نه فقط ضرب دکارتی کامل).
 *  - قیمت و موجودی عدد صحیح نامنفی‌اند.
 *  - ترکیب تکراری در یک درخواست ممنوع؛ سقف ۱۰۰ واریانت.
 */
export function cleanBatchInput(input: BatchInput): {
  attributes: AttributeOption[];
  variants: (BatchVariantInput & { key: string })[];
} {
  const attributes: AttributeOption[] = [];
  const byName = new Map<string, AttributeOption>();
  for (const raw of input.attributes) {
    const name = raw.name.trim();
    const values = [...new Set(raw.values.map((v) => v.trim()).filter(Boolean))];
    if (!name || values.length === 0) continue;
    const existing = byName.get(name);
    if (existing) {
      existing.values = [...new Set([...existing.values, ...values])];
    } else {
      const row = { name, values };
      byName.set(name, row);
      attributes.push(row);
    }
  }
  const names = new Set(attributes.map((a) => a.name));
  if (attributes.length > 10) throw new Error('حداکثر ۱۰ ویژگی مجاز است');

  const variants = input.variants.map((v) => {
    const options: Record<string, string> = {};
    for (const [rawName, rawValue] of Object.entries(v.options ?? {})) {
      const name = rawName.trim();
      const value = String(rawValue ?? '').trim();
      if (!name || !value) continue;
      if (!names.has(name)) throw new Error(`ویژگی «${name}» در فهرست ویژگی‌ها نیست`);
      options[name] = value;
    }
    if (Object.keys(options).length === 0) throw new Error('هر واریانت باید دست‌کم یک ویژگی داشته باشد');
    if (!Number.isInteger(v.price) || v.price < 0) throw new Error('قیمت باید عدد صحیح نامنفی باشد');
    if (!Number.isInteger(v.stock) || v.stock < 0) throw new Error('موجودی باید عدد صحیح نامنفی باشد');
    return { options, price: v.price, stock: v.stock, key: combinationKey(options) };
  });

  if (new Set(variants.map((v) => v.key)).size !== variants.length) {
    throw new Error('ترکیب تکراری در فهرست واریانت‌ها هست');
  }
  if (variants.length > MAX_VARIANT_COMBINATIONS) {
    throw new Error(`حداکثر ${MAX_VARIANT_COMBINATIONS} واریانت مجاز است`);
  }
  return { attributes, variants };
}
