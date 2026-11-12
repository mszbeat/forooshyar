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

export const plansApi = {
  list: () => request<Plan[]>('/subscriptions/plans', { auth: false }),
  bySlug: (slug: string) => request<Plan>(`/subscriptions/plans/${encodeURIComponent(slug)}`, { auth: false }),
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
