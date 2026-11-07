#!/usr/bin/env node
/**
 * راه‌اندازی webhook تلگرام — بدون هیچ ابزار اضافه.
 *
 *   node scripts/telegram-setup.ts            # وضعیت فعلی + ثبت webhook
 *   node scripts/telegram-setup.ts --info     # فقط وضعیت
 *   node scripts/telegram-setup.ts --delete   # حذف webhook
 *
 * متغیرهای لازم (همان‌ها که در سرویس API روی Render گذاشته‌ای):
 *   TELEGRAM_BOT_TOKEN        از BotFather
 *   TELEGRAM_WEBHOOK_SECRET   یک رشته‌ی تصادفی؛ هم در مسیر URL می‌آید هم در هدر
 *   PUBLIC_API_URL            آدرس عمومی API، مثل https://forooshyar-api.onrender.com
 *
 * چرا webhook و نه polling: روی Render پلن Free سرویس می‌خوابد؛ polling در چنین
 * محیطی message را از دست می‌دهد و دائماً ری‌استارت می‌شود. webhook را خود تلگرام
 * push می‌کند و سرویس با هر پیام بیدار می‌شود.
 */
import 'dotenv/config';

const token = (process.env.TELEGRAM_BOT_TOKEN ?? '').trim();
const secret = (process.env.TELEGRAM_WEBHOOK_SECRET ?? '').trim();
const publicApi = (process.env.PUBLIC_API_URL ?? '').trim().replace(/\/+$/, '');
const base = (process.env.TELEGRAM_API_BASE ?? 'https://api.telegram.org').replace(/\/+$/, '');

const red = (value: string) => `\u001b[31m${value}\u001b[0m`;
const green = (value: string) => `\u001b[32m${value}\u001b[0m`;
const dim = (value: string) => `\u001b[2m${value}\u001b[0m`;

function fail(message: string): never {
  console.error(red(`\n✖ ${message}\n`));
  process.exit(1);
}

function describeNetworkError(error: unknown): string {
  const cause = (error as { cause?: { code?: string; errno?: string; message?: string } })?.cause;
  const code = cause?.code ?? cause?.errno ?? '';
  const hints: Record<string, string> = {
    ENOTFOUND: 'DNS جواب نداد؛ یا اینترنت/DNS قطع است یا دامنه در شبکه‌ی شما بلاک شده.',
    EAI_AGAIN: 'DNS موقتاً جواب نداد.',
    ECONNREFUSED: 'اتصال رد شد؛ اگر پروکسی یا فایروال دارید، مسیر api.telegram.org باز نیست.',
    ECONNRESET: 'اتصال وسط کار قطع شد (فیلترینگ/پروکسی).',
    ETIMEDOUT: 'اتصال تایم‌اوت شد؛ شبکه به api.telegram.org نمی‌رسد.',
    UND_ERR_CONNECT_TIMEOUT: 'اتصال تایم‌اوت شد؛ شبکه به api.telegram.org نمی‌رسد.',
    CERT_HAS_EXPIRED: 'گواهی TLS معتبر نیست — احتمالاً یک پروکسی/فایروال TLS را بازرسی می‌کند.',
    SELF_SIGNED_CERT_IN_CHAIN: 'یک پروکسی با گواهی خودش وسط اتصال است.',
  };
  const base = code ? ` [${code}]` : '';
  const hint = hints[code] ? `\n   ${hints[code]}` : '';
  return `اتصال به ${baseUrlUsed} برقرار نشد${base}.${hint}`;
}

let baseUrlUsed = base;

async function call<T>(method: string, body: Record<string, unknown> = {}): Promise<T> {
  if (!token) fail('TELEGRAM_BOT_TOKEN ست نشده است. توکن BotFather را در Environment بگذار.');

  const url = `${base}/bot${token}/${method}`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
  } catch (error) {
    fail(describeNetworkError(error) + `
   بررسی سریع:  curl -sS -o /dev/null -w '%{http_code}\n' ${base}
   اگر این هم خطا داد، شبکه‌ی شما به تلگرام دسترسی ندارد: VPN روشن کن یا
   از یک شبکه‌ی دیگر (یا سرور خارج) همین دستور را بزن.
   راه‌حل بدون VPN:  npm run telegram:setup -- --print-curl`);
  }
  const payload = await response.json().catch(() => null) as { ok?: boolean; result?: T; description?: string } | null;
  if (!payload?.ok) fail(`${method} ناموفق: ${payload?.description ?? `HTTP ${response.status}`}`);
  return payload.result as T;
}

async function main() {
  if (!token) fail('TELEGRAM_BOT_TOKEN ست نشده است.');

  console.log(dim(`   API: ${base}`));
  for (const key of ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy']) {
    if (process.env[key]) console.log(dim(`   پروکسی محیط: ${key}=${process.env[key]}`));
  }

  const mode = process.argv[2];

  if (mode === '--print-curl') {
    if (!secret || !publicApi) fail('برای این حالت TELEGRAM_WEBHOOK_SECRET و PUBLIC_API_URL هم لازم است.');
    const hookUrl = `${publicApi}/telegram/webhook/${secret}`;
    const setBody = JSON.stringify({ url: hookUrl, secret_token: secret, allowed_updates: ['message', 'edited_message'] });
    console.log(`\n${dim('# این سه دستور را هر جا که به تلگرام دسترسی دارد بزن (VPN، سرور خارج، یا با --proxy):')}\n`);
    console.log(`curl -sS --proxy http://USER:PASS@HOST:PORT -X POST "${base}/bot${token}/setWebhook" \\`);
    console.log(`  -H 'content-type: application/json' \\`);
    console.log(`  -d '${setBody}'\n`);
    console.log(`curl -sS --proxy http://USER:PASS@HOST:PORT "${base}/bot${token}/getWebhookInfo"\n`);
    console.log(`curl -sS --proxy http://USER:PASS@HOST:PORT -X POST "${base}/bot${token}/deleteWebhook"\n`);
    console.log(dim('  اگر پروکسی نداری، عبارت «--proxy ...» را حذف کن.'));
    console.log(dim('  ⚠ توکن داخل این دستورها هست؛ در تاریخچه‌ی شل یا اسکرین‌شات نگذار.\n'));
    return;
  }

  const me = await call<{ id: number; username?: string; first_name?: string }>('getMe');
  console.log(`\n🤖 بات: ${green(`@${me.username ?? me.id}`)} (${me.first_name ?? '-'})`);

  if (mode === '--delete') {
    await call('deleteWebhook', { drop_pending_updates: false });
    console.log(green('✔ webhook حذف شد.') + dim(' (بات دیگر پیام نمی‌گیرد)'));
    return;
  }

  const info = await call<{ url?: string; pending_update_count?: number; last_error_message?: string }>('getWebhookInfo');
  console.log(`   وضعیت فعلی: ${info.url ? green(info.url) : dim('بدون webhook')}`);
  if (info.last_error_message) console.log(`   آخرین خطای تلگرام: ${red(info.last_error_message)}`);
  if (info.pending_update_count) console.log(`   در صف: ${info.pending_update_count}`);

  if (mode === '--info') return;

  if (!secret || secret.length < 16) fail('TELEGRAM_WEBHOOK_SECRET لازم است و باید حداقل ۱۶ کاراکتر باشد.');
  if (!publicApi) fail('PUBLIC_API_URL را ست کن، مثل https://forooshyar-api.onrender.com');
  if (!/^https:\/\//.test(publicApi)) fail('آدرس webhook تلگرام باید https باشد.');

  const url = `${publicApi}/telegram/webhook/${secret}`;
  await call('setWebhook', {
    url,
    secret_token: secret,
    allowed_updates: ['message', 'edited_message'],
    drop_pending_updates: false,
  });

  console.log(green('\n✔ webhook ثبت شد.'));
  console.log(`   ${dim('URL')}      ${url.replace(secret, `${secret.slice(0, 4)}…`)}`);
  console.log(`   ${dim('لینک مشتری')}  https://t.me/${me.username}?start=<کد فروشگاه>`);
  console.log(`   ${dim('کد فروشگاه را از پنل بگیر: تنظیمات → اتصال تلگرام')}\n`);
  console.log(dim('بررسی: node scripts/telegram-setup.ts --info\n'));
}

main().catch(error => {
  console.error(red(`\n✖ ${error instanceof Error ? error.message : String(error)}\n`));
  process.exit(1);
});
