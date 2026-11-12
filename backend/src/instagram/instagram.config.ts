/**
 * پیکربندی اینستاگرام (BoxAPI).
 *
 * نکته‌ی معماری — چه چیزی «پلتفرمی» است و چه چیزی «هر فروشگاه»:
 *
 *   پلتفرمی (env): کلید API، سکرت webhook، آدرس پایه و **لینک ورود اختصاصی**
 *   حساب باکس‌ای‌پی. طبق مستندات BoxAPI، همه‌ی پیج‌هایی که از طریق همین لینک
 *   وارد می‌شوند در `GET /service/accounts` فهرست می‌شوند. یعنی یک حساب
 *   باکس‌ای‌پی برای کل پلتفرم کافی است.
 *
 *   هر فروشگاه (دیتابیس): `account_id` پیج خودش. این مقدار **نمی‌تواند** در env
 *   باشد، چون هر فروشگاه پیج خودش را دارد؛ فروشنده از پنل وصل می‌کند و روی
 *   `Channel.instagramAccountId` ذخیره می‌شود. (نسخه‌ی اول این اشتباه را داشت.)
 *
 * توکن اجازه‌ی ارسال پیام از پیج فروشنده را می‌دهد؛ پس فقط سمت سرور می‌ماند و
 * هیچ endpointی آن را — حتی ماسک‌شده — به کلاینت نمی‌فرستد.
 */

export type InstagramConfig = {
  /** ریشه‌ی API؛ پیش‌فرض همان آدرسی که داشبورد BoxAPI می‌دهد. */
  baseUrl: string;
  /** توکن دسترسی (`X-Api-Key`). */
  apiKey: string;
  /**
   * توکن BoxAPI Data API برای `get_info_by_id` (نام پیج از روی IGSID).
   * با کلید DM فرق دارد؛ اختیاری است و اگر خالی باشد، نام مشتری اینستاگرام
   * از webhook می‌آید و در نبودش «مشتری اینستاگرام» نمایش داده می‌شود.
   */
  dataToken: string;
  /** سکرت webhook؛ اگر خالی باشد امضا بررسی نمی‌شود (فقط برای توسعه‌ی محلی). */
  webhookSecret: string;
  /**
   * لینک ورود اختصاصی حساب باکس‌ای‌پی (`instagram_oauth_url`).
   * همه‌ی فروشگاه‌ها همین لینک را باز می‌کنند و هر کدام با حساب خودش وارد
   * می‌شود؛ بعد از آن پیج در `/service/accounts` ظاهر می‌شود.
   */
  loginUrl: string;
  timeoutMs: number;
};

const DEFAULT_BASE = 'https://api.sendbox.chat/api/v1';

export function readInstagramConfig(env: NodeJS.ProcessEnv = process.env): InstagramConfig {
  const timeout = Number(env.INSTAGRAM_TIMEOUT_MS ?? 10000);
  return {
    baseUrl: (env.INSTAGRAM_BASE_URL ?? DEFAULT_BASE).trim().replace(/\/+$/, ''),
    apiKey: (env.INSTAGRAM_API_KEY ?? '').trim(),
    dataToken: (env.BOXAPI_DATA_TOKEN ?? '').trim(),
    webhookSecret: (env.INSTAGRAM_WEBHOOK_SECRET ?? '').trim(),
    loginUrl: (env.INSTAGRAM_LOGIN_URL ?? '').trim(),
    timeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : 10000,
  };
}

/** آدرس عمومی webhook؛ روی Render خودکار از RENDER_EXTERNAL_URL ساخته می‌شود. */
export function webhookUrl(config: InstagramConfig, env: NodeJS.ProcessEnv = process.env): string {
  const base = (env.PUBLIC_API_URL ?? env.RENDER_EXTERNAL_URL ?? '').trim().replace(/\/+$/, '');
  return base ? `${base}/webhooks/instagram` : '';
}

/**
 * آیا سرویس آماده است؟ فقط کلید API لازم است؛ پیج را فروشنده وصل می‌کند.
 */
export function instagramConfigured(config: InstagramConfig): boolean {
  return config.apiKey.length > 0;
}

/** آیا دکمه‌ی «اتصال پیج» قابل نمایش است (لینک ورود تنظیم شده). */
export function instagramConnectable(config: InstagramConfig): boolean {
  return config.apiKey.length > 0 && config.loginUrl.length > 0;
}
