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

export type InstagramProviderName = 'boxapi' | 'meta';

export type InstagramConfig = {
  /**
   * ارائه‌دهنده‌ی اینستاگرام: `boxapi` (پیش‌فرض، اشتراک ماهانه) یا `meta`
   * (API رسمی متا، رایگان). هر دو یک interface را پیاده می‌کنند و منطق ربات
   * مشترک است؛ جابه‌جایی فقط با همین env انجام می‌شود.
   */
  provider: InstagramProviderName;
  /** ریشه‌ی API؛ پیش‌فرض همان آدرسی که داشبورد BoxAPI می‌دهد. */
  baseUrl: string;
  /** توکن دسترسی (`X-Api-Key`). */
  apiKey: string;
  /** --- Meta (API رسمی) --- */
  /** شناسه‌ی اپ متا (Meta App ID). */
  metaAppId: string;
  /** سکرت اپ متا؛ برای تبادل کد OAuth و تأیید امضای webhook. فقط سمت سرور. */
  metaAppSecret: string;
  /** توکن تأیید handshake وب‌هوک متا (مقدار دلخواه، در داشبورد متا هم ثبت می‌شود). */
  metaVerifyToken: string;
  /** نسخه‌ی Graph API؛ پیش‌فرض v21.0. */
  metaGraphVersion: string;
  /** آدرس callback برای OAuth؛ پیش‌فرض از PUBLIC_API_URL ساخته می‌شود. */
  metaRedirectUri: string;
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
  // ارائه‌دهنده‌ی مؤثر: فقط وقتی meta است که هم درخواست شده باشد و هم
  // META_APP_ID/META_APP_SECRET ست باشند؛ در غیر این صورت boxapi تا پروژه
  // همیشه بالا بیاید و به خطا نخورد (حتی اگر فقط INSTAGRAM_PROVIDER=meta ست شده باشد).
  const requested: InstagramProviderName = (env.INSTAGRAM_PROVIDER ?? 'boxapi').trim().toLowerCase() === 'meta' ? 'meta' : 'boxapi';
  const metaReady = (env.META_APP_ID ?? '').trim().length > 0 && (env.META_APP_SECRET ?? '').trim().length > 0;
  const provider: InstagramProviderName = requested === 'meta' && metaReady ? 'meta' : 'boxapi';
  const publicBase = (env.PUBLIC_API_URL ?? env.RENDER_EXTERNAL_URL ?? '').trim().replace(/\/+$/, '');
  return {
    provider,
    baseUrl: (env.INSTAGRAM_BASE_URL ?? DEFAULT_BASE).trim().replace(/\/+$/, ''),
    apiKey: (env.INSTAGRAM_API_KEY ?? '').trim(),
    metaAppId: (env.META_APP_ID ?? '').trim(),
    metaAppSecret: (env.META_APP_SECRET ?? '').trim(),
    metaVerifyToken: (env.META_VERIFY_TOKEN ?? '').trim(),
    metaGraphVersion: (env.META_GRAPH_VERSION ?? 'v21.0').trim() || 'v21.0',
    metaRedirectUri: (env.META_REDIRECT_URI ?? '').trim() || (publicBase ? `${publicBase}/instagram/meta/callback` : ''),
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
 * آیا سرویس آماده است؟ برای boxapi کلید API و برای meta شناسه/سکرت اپ لازم
 * است؛ پیج را فروشنده وصل می‌کند.
 */
export function instagramConfigured(config: InstagramConfig): boolean {
  return config.provider === 'meta'
    ? config.metaAppId.length > 0 && config.metaAppSecret.length > 0
    : config.apiKey.length > 0;
}

/** آیا دکمه‌ی «اتصال پیج» قابل نمایش است. */
export function instagramConnectable(config: InstagramConfig): boolean {
  return config.provider === 'meta'
    ? instagramConfigured(config) && config.metaRedirectUri.length > 0
    : config.apiKey.length > 0 && config.loginUrl.length > 0;
}
