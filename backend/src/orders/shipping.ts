/**
 * محاسبه‌ی هزینه ارسال — کاملاً قطعی و سمت سرور.
 *
 * مدل هرگز هزینه ارسال را نمی‌سازد؛ فقط این توابع از روی روش‌های
 * تعریف‌شده‌ی فروشگاه و استان/شهر مشتری عدد می‌دهند.
 *
 * قانون‌ها:
 *  - FIXED: مبلغ ثابت.
 *  - FREE_OVER: اگر جمع اقلام >= آستانه باشد رایگان، وگرنه مبلغ ثابت.
 *  - TABLE: جدول استانی/شهری؛ کلیدها مثل «تهران» یا «تهران/شهریار» و
 *    کلید «*» برای پیش‌فرض. اگر استان در جدول نبود، پیش‌فرض استفاده می‌شود.
 *  - PICKUP: برداشت حضوری، همیشه رایگان.
 */

export type ShippingKind = 'FIXED' | 'FREE_OVER' | 'TABLE' | 'PICKUP';

export interface ShippingMethodLike {
  id: string;
  name: string;
  kind: string;
  baseCost: number;
  freeOver: number | null;
  rulesJson: unknown;
  active: boolean;
}

function rulesOf(method: ShippingMethodLike): Record<string, number> {
  const raw = method.rulesJson;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const num = typeof value === 'number' ? value : Number(value);
    if (Number.isFinite(num) && num >= 0) out[key] = Math.round(num);
  }
  return out;
}

/** هزینه ارسال برای یک روش و مقصد مشخص (تومان). */
export function shippingCostFor(
  method: ShippingMethodLike,
  input: { subtotal: number; province: string; city: string },
): number {
  switch (method.kind) {
    case 'PICKUP':
      return 0;
    case 'FREE_OVER':
      return method.freeOver != null && input.subtotal >= method.freeOver
        ? 0
        : method.baseCost;
    case 'TABLE': {
      const rules = rulesOf(method);
      const province = input.province.trim();
      const city = input.city.trim();
      const cityKey = province && city ? `${province}/${city}` : '';
      if (cityKey && rules[cityKey] !== undefined) return rules[cityKey];
      if (province && rules[province] !== undefined) return rules[province];
      if (rules['*'] !== undefined) return rules['*'];
      return method.baseCost;
    }
    case 'FIXED':
    default:
      return method.baseCost;
  }
}

/** انتخاب روش پیش‌فرض: اولین روش فعال (به ترتیب sortOrder). */
export function pickDefaultMethod<T extends ShippingMethodLike>(methods: T[]): T | null {
  return methods.find((m) => m.active) ?? null;
}

/** جمع نهایی سفارش: subtotal + shipping − discount (هرگز منفی نمی‌شود). */
export function orderTotal(subtotal: number, shippingCost: number, discount: number): number {
  return Math.max(0, subtotal + shippingCost - discount);
}
