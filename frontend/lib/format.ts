/** Formatting helpers. All output is Persian (fa-IR), no external dependencies. */

const nf = new Intl.NumberFormat('fa-IR');

export const faNum = (value: number | string): string => {
  const numeric = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(numeric)) return '—';
  return nf.format(numeric);
};

/** 1_250_000 → «۱٬۲۵۰٬۰۰۰ تومان» */
export const toman = (value: number): string => `${faNum(value)} تومان`;

/** Compact money for stat cards: ۱۲٫۴ میلیون */
export const tomanShort = (value: number): string => {
  if (value >= 1_000_000_000) return `${faNum(Number((value / 1_000_000_000).toFixed(1)))} میلیارد`;
  if (value >= 1_000_000) return `${faNum(Number((value / 1_000_000).toFixed(1)))} میلیون`;
  if (value >= 1000) return `${faNum(Number((value / 1000).toFixed(0)))} هزار`;
  return faNum(value);
};

const MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
const WEEKDAYS = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه'];

function div(a: number, b: number) { return Math.trunc(a / b); }

/** Gregorian → Jalali (algorithm by jalaali-js, MIT). */
export function toJalali(date: Date): { year: number; month: number; day: number } {
  const gy = date.getFullYear();
  const gm = date.getMonth() + 1;
  const gd = date.getDate();
  const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  let jy = gy <= 1600 ? 0 : 979;
  const gy2 = gy <= 1600 ? gy - 621 : gy - 1600;
  const gm2 = gm > 2 ? 1 : 0;
  let days = 365 * gy2 + div(gy2 + 3, 4) - div(gy2 + 99, 100) + div(gy2 + 399, 400) - 80 + gd + g_d_m[gm - 1] + (gm2 && ((gy2 % 4 === 0 && gy2 % 100 !== 0) || gy2 % 400 === 0) ? 1 : 0);
  jy += 33 * div(days, 12053);
  days %= 12053;
  jy += 4 * div(days, 1461);
  days %= 1461;
  if (days > 365) { jy += div(days - 1, 365); days = (days - 1) % 365; }
  const jm = days < 186 ? 1 + div(days, 31) : 7 + div(days - 186, 30);
  const jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30);
  return { year: jy, month: jm, day: jd };
}

/** ۵ آبان ۱۴۰۵ */
export const faDate = (input: string | Date): string => {
  const date = typeof input === 'string' ? new Date(input) : input;
  if (Number.isNaN(date.getTime())) return '—';
  const { year, month, day } = toJalali(date);
  return `${faNum(day)} ${MONTHS[month - 1]} ${faNum(year)}`;
};

/** ۵ آبان ۱۴۰۵ · ۱۴:۰۳ */
export const faDateTime = (input: string | Date): string => {
  const date = typeof input === 'string' ? new Date(input) : input;
  if (Number.isNaN(date.getTime())) return '—';
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${faDate(date)} · ${faNum(hh)}:${faNum(mm)}`;
};

export const faWeekday = (input: string | Date): string => {
  const date = typeof input === 'string' ? new Date(input) : input;
  return WEEKDAYS[date.getDay()];
};

/** «۳ ساعت پیش» */
export const relativeTime = (input: string | Date): string => {
  const date = typeof input === 'string' ? new Date(input) : input;
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (Number.isNaN(seconds)) return '—';
  if (seconds < 45) return 'همین حالا';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${faNum(minutes)} دقیقه پیش`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${faNum(hours)} ساعت پیش`;
  const days = Math.round(hours / 24);
  if (days < 31) return `${faNum(days)} روز پیش`;
  const months = Math.round(days / 30);
  if (months < 12) return `${faNum(months)} ماه پیش`;
  return faDate(date);
};

/** Age in days, used for the «stale stock» hint. */
export const daysSince = (input: string | Date): number => {
  const date = typeof input === 'string' ? new Date(input) : input;
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 86_400_000));
};

export const variantLabel = (variant: { size?: string; color?: string }): string => {
  const parts = [variant.color, variant.size].filter((part): part is string => Boolean(part && part.trim()));
  return parts.length ? parts.join(' · ') : 'تک‌سایز';
};

export const statusOfStock = (stock: number): { label: string; tone: 'green' | 'amber' | 'red' } => {
  if (stock === 0) return { label: 'ناموجود', tone: 'red' };
  if (stock <= 3) return { label: 'موجودی کم', tone: 'amber' };
  return { label: 'موجود', tone: 'green' };
};
