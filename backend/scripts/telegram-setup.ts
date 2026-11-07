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

async function call<T>(method: string, body: Record<string, unknown> = {}): Promise<T> {
  if (!token) fail('TELEGRAM_BOT_TOKEN ست نشده است. توکن BotFather را در Environment بگذار.');
  const response = await fetch(`${base}/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null) as { ok?: boolean; result?: T; description?: string } | null;
  if (!payload?.ok) fail(`${method} ناموفق: ${payload?.description ?? `HTTP ${response.status}`}`);
  return payload.result as T;
}

async function main() {
  if (!token) fail('TELEGRAM_BOT_TOKEN ست نشده است.');

  const me = await call<{ id: number; username?: string; first_name?: string }>('getMe');
  console.log(`\n🤖 بات: ${green(`@${me.username ?? me.id}`)} (${me.first_name ?? '-'})`);

  const mode = process.argv[2];

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
