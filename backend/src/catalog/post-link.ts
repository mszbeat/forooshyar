/**
 * نرمال‌سازی لینک پست اینستاگرام به شورت‌کد/مدیا آیدی (تسک ۸).
 * ورودی می‌تواند URL کامل، شورت‌کد خالی یا مدیا آیدی عددی باشد.
 * خروجی: { shortcode, mediaId } — mediaId برای تطبیق وب‌هوک کامنت است.
 */
export function normalizePostInput(input: string): { shortcode: string; mediaId: string } {
  const raw = input.trim();
  if (!raw) return { shortcode: '', mediaId: '' };
  // URL کامل: instagram.com/p/<shortcode>/ یا /reel/<shortcode>/
  const urlMatch = raw.match(/instagram\.com\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/i);
  if (urlMatch) return { shortcode: urlMatch[1], mediaId: urlMatch[1] };
  // شورت‌کد خالی (بدون اسلش/دامنه)
  if (/^[A-Za-z0-9_-]{5,30}$/.test(raw)) return { shortcode: raw, mediaId: raw };
  // مدیا آیدی عددی
  if (/^\d{5,30}$/.test(raw)) return { shortcode: '', mediaId: raw };
  throw new Error('لینک پست معتبر نیست؛ لینک پست یا ریل اینستاگرام را وارد کنید.');
}

export function isValidPostInput(input: string): boolean {
  try { normalizePostInput(input); return input.trim().length > 0; }
  catch { return false; }
}
