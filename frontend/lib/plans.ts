import { request } from './api';

/** پلن اشتراک — همان چیزی که API برمی‌گرداند (منبع حقیقت: دیتابیس). */
export type Plan = {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  description: string;
  features: string[];
  monthlyPrice: number;
  listMonthlyPrice: number;
  instagramLimit: number;
  telegramLimit: number;
  monthlyMessageLimit: number;
  productLimit: number;
  isPopular: boolean;
  sortOrder: number;
  extraInstagramPrice: number;
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
  months: number;
  extraInstagram: number;
  addonUnitPrice: number;
  discountCode: string | null;
  endsAt: string;
};

/**
 * نرمال‌سازی پاسخ API به شکل کامل `Plan`.
 *
 * چرا: اگر بک‌اند هنوز نسخه‌ی قدیمی باشد، پلن‌ها بدون `features`/`slug`/…
 * برمی‌گردند و دسترسی مستقیم (`plan.features.slice`) صفحه را کرش می‌کند.
 * با پیش‌فرض‌های امن، فرانت با هر دو نسخه‌ی بک‌اند کار می‌کند.
 */
function normalizePlan(raw: Partial<Plan> & { id: string; name: string }): Plan {
  return {
    id: raw.id,
    slug: raw.slug ?? raw.id,
    name: raw.name,
    tagline: raw.tagline ?? '',
    description: raw.description ?? '',
    features: Array.isArray(raw.features) ? raw.features : [],
    monthlyPrice: raw.monthlyPrice ?? 0,
    listMonthlyPrice: raw.listMonthlyPrice ?? 0,
    instagramLimit: raw.instagramLimit ?? 0,
    telegramLimit: raw.telegramLimit ?? 0,
    monthlyMessageLimit: raw.monthlyMessageLimit ?? 0,
    productLimit: raw.productLimit ?? 0,
    isPopular: raw.isPopular ?? false,
    sortOrder: raw.sortOrder ?? 0,
    extraInstagramPrice: raw.extraInstagramPrice ?? 0,
  };
}

export const plansApi = {
  list: async (): Promise<Plan[]> => {
    const rows = await request<Partial<Plan>[]>('/subscriptions/plans', { auth: false });
    return (Array.isArray(rows) ? rows : [])
      .filter((row): row is Partial<Plan> & { id: string; name: string } => Boolean(row?.id && row?.name))
      .map(normalizePlan);
  },
  bySlug: async (slug: string): Promise<Plan> => {
    const raw = await request<Partial<Plan> & { id: string; name: string }>(`/subscriptions/plans/${encodeURIComponent(slug)}`, { auth: false });
    return normalizePlan(raw);
  },
  quote: (body: { planId: string; months: number; extraInstagram: number; discountCode?: string }) =>
    request<Quote>('/subscriptions/quote', { method: 'POST', body, auth: false }),
  checkout: (body: { planId: string; months: number; extraInstagram: number; discountCode?: string }) =>
    request<{ url: string; provider: string }>('/subscriptions/checkout', { method: 'POST', body }),
};

/** درصد تخفیف مدت — آینه‌ی سمت سرور برای نمایش فوری (مبلغ نهایی از سرور می‌آید). */
export function durationDiscountPercent(months: number): number {
  if (months >= 12) return 20;
  if (months >= 6) return 15;
  if (months >= 3) return 10;
  return 0;
}

export const MONTH_CHIPS = [1, 3, 6, 12, 18];
