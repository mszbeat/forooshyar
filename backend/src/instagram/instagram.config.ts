/**
 * پیکربندی اینستاگرام (BoxAPI).
 *
 * چرا همه‌چیز از env: توکن دسترسی BoxAPI اجازه‌ی ارسال پیام از **پیج خود
 * فروشنده** را می‌دهد. اگر روزی در باندل فرانت‌اند بیاید، هر بازدیدکننده‌ای
 * می‌تواند از طرف فروشنده پیام بفرستد. مستندات BoxAPI هم صریح گفته‌اند این
 * مقدار فقط باید در بک‌اند باشد. پس هیچ‌جای پروژه مقدار خام توکن را به کلاینت
 * نمی‌فرستیم؛ حتی به پنل خود فروشنده (فقط «ست شده / ست نشده» می‌رود).
 *
 * نام کلیدها با پیشوند `INSTAGRAM_` است، تا با کلیدهای عمومی BoxAPI که ممکن
 * است بعداً برای کانال دیگری هم استفاده شوند قاطی نشود.
 */

export type InstagramConfig = {
  /** ریشه‌ی API؛ پیش‌فرض همان آدرسی است که داشبورد BoxAPI می‌دهد. */
  baseUrl: string;
  /** توکن دسترسی (`X-Api-Key`). */
  apiKey: string;
  /** سکرت webhook؛ اگر خالی باشد امضا بررسی نمی‌شود (فقط برای توسعه‌ی محلی). */
  webhookSecret: string;
  /** UUID پیج اینستاگرام که پیام‌ها از طرف آن می‌رود. */
  accountId: string;
  /** لینک اتصال حساب که BoxAPI در داشبورد می‌دهد (فقط برای نمایش در پنل). */
  loginUrl: string;
  /**
   * اگر چندانتیتی نباشیم (یک فروشگاه، یک پیج — حالت پلن رایگان)، پیام‌های
   * حسابی که در `Channel` ثبت نشده به همین کد فروشگاه وصل می‌شوند.
   */
  shopCode: string;
  timeoutMs: number;
  /** لینک صفحه‌ی اینستاگرام فروشنده؛ در دکمه‌های «مشاهده در سایت» استفاده می‌شود. */
  profileUrl: string;
};

const DEFAULT_BASE = 'https://api.sendbox.chat/api/v1';

export function readInstagramConfig(env: NodeJS.ProcessEnv = process.env): InstagramConfig {
  const timeout = Number(env.INSTAGRAM_TIMEOUT_MS ?? 10000);
  return {
    baseUrl: (env.INSTAGRAM_BASE_URL ?? DEFAULT_BASE).trim().replace(/\/+$/, ''),
    apiKey: (env.INSTAGRAM_API_KEY ?? '').trim(),
    webhookSecret: (env.INSTAGRAM_WEBHOOK_SECRET ?? '').trim(),
    accountId: (env.INSTAGRAM_ACCOUNT_ID ?? '').trim(),
    loginUrl: (env.INSTAGRAM_LOGIN_URL ?? '').trim(),
    shopCode: (env.INSTAGRAM_SHOP_CODE ?? '').trim(),
    timeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : 10000,
    profileUrl: (env.INSTAGRAM_PROFILE_URL ?? '').trim(),
  };
}

/** آدرس عمومی webhook؛ روی Render خودکار از RENDER_EXTERNAL_URL ساخته می‌شود. */
export function webhookUrl(config: InstagramConfig, env: NodeJS.ProcessEnv = process.env): string {
  const base = (env.PUBLIC_API_URL ?? env.RENDER_EXTERNAL_URL ?? '').trim().replace(/\/+$/, '');
  return base ? `${base}/webhooks/instagram` : '';
}

/**
 * آیا اتصال کامل است؟ `accountId` هم لازم است چون بدون آن هیچ اکشنی از
 * BoxAPI پذیرفته نمی‌شود و بهتر است پنل «ناقص» نشان دهد نه «فعال».
 */
export function instagramConfigured(config: InstagramConfig): boolean {
  return config.apiKey.length > 0 && config.accountId.length > 0;
}
