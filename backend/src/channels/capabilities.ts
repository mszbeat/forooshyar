/**
 * لایه‌ی قابلیت‌های کانال (تسک ۱۲): هر پلتفرم چه چیزی پشتیبانی می‌کند.
 * بات‌ها از این‌جا تصمیم می‌گیرند دکمه بفرستند یا لیست شماره‌دار متنی.
 */
export interface ChannelCapabilities {
  supportsButtons: boolean;
  supportsCarousel: boolean;
  supportsNumberedList: boolean;
}

const CAPABILITIES: Record<string, ChannelCapabilities> = {
  TELEGRAM: { supportsButtons: true, supportsCarousel: true, supportsNumberedList: true },
  BALE: { supportsButtons: true, supportsCarousel: false, supportsNumberedList: true },
  RUBIKA: { supportsButtons: true, supportsCarousel: false, supportsNumberedList: true },
  INSTAGRAM: { supportsButtons: false, supportsCarousel: false, supportsNumberedList: true },
};

export function capabilitiesFor(platform: string): ChannelCapabilities {
  return CAPABILITIES[platform.toUpperCase()] ?? { supportsButtons: false, supportsCarousel: false, supportsNumberedList: true };
}

/** تبدیل ارقام فارسی/عربی به انگلیسی برای پارس لیست شماره‌دار. */
export function normalizeDigits(value: string): string {
  return value.replace(/[۰-۹]/g, c => String(c.charCodeAt(0) - 1776)).replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 1632));
}

/** پارس انتخاب از لیست شماره‌دار؛ متن اضافه را تحمل می‌کند. */
export function parseNumberedChoice(text: string, max: number): number | null {
  const normalized = normalizeDigits(text.trim());
  const match = normalized.match(/(\d{1,2})/);
  if (!match) return null;
  const num = Number(match[1]);
  return num >= 1 && num <= max ? num : null;
}
