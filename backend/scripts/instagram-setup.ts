import 'dotenv/config';
import { readInstagramConfig, instagramConfigured, webhookUrl } from '../src/instagram/instagram.config';
import { InstagramClient } from '../src/instagram/instagram.client';

/**
 * بررسی اتصال اینستاگرام بدون بالا آوردن کل سرور.
 *
 * چرا لازم است: اولین جایی که اتصال می‌شکند، سه مقدار env است و خطاهای BoxAPI
 * هم کلی‌اند («unauthorized»). این اسکریپت همان سه مقدار را چاپ می‌کند، یک
 * درخواست واقعی می‌زند و آدرس webhook را نشان می‌دهد؛ عیب‌یابی از ۱۰ دقیقه به
 * ۱۰ ثانیه می‌رسد.
 *
 * اجرا:  npm run instagram:setup
 *        npm run instagram:setup -- --send=17841400000000000
 *
 * توکن و سکرت **چاپ نمی‌شوند** — نه کامل، نه ماسک‌شده.
 */

const config = readInstagramConfig();
const testRecipient = process.argv.find(arg => arg.startsWith('--send='))?.slice('--send='.length) ?? '';

function line(label: string, value: string, ok?: boolean): void {
  const mark = ok === undefined ? '·' : ok ? '✅' : '⚠️';
  console.log(`${mark} ${label}: ${value}`);
}

async function main(): Promise<void> {
  console.log('\n— بررسی اتصال اینستاگرام (BoxAPI) —\n');
  line('آدرس پایه', config.baseUrl);
  line('توکن دسترسی', config.apiKey ? 'ست شده' : 'ست نشده', Boolean(config.apiKey));
  line('شناسه پیج (account_id)', config.accountId ? `${config.accountId.slice(0, 8)}…` : 'ست نشده', Boolean(config.accountId));
  line('سکرت webhook', config.webhookSecret ? 'ست شده (امضا فعال)' : 'ست نشده (امضا غیرفعال!)', Boolean(config.webhookSecret));
  line('کد فروشگاه پیش‌فرض', config.shopCode || '— (تشخیص خودکار)');
  line('آدرس webhook', webhookUrl(config) || 'ست نشده — PUBLIC_API_URL را بگذارید', webhookUrl(config).startsWith('https://'));

  if (!instagramConfigured(config)) {
    console.log('\n⛔ INSTAGRAM_API_KEY و INSTAGRAM_ACCOUNT_ID را از داشبورد BoxAPI پر کنید و دوباره اجرا کنید.\n');
    return;
  }

  const client = new InstagramClient(config);
  console.log('\n— درخواست آزمایشی —');
  if (testRecipient) {
    const result = await client.sendMessage({ recipientId: testRecipient, message: 'پیام آزمایشی از فروش‌یار ✅' });
    console.log(result.ok ? '✅ پیام آزمایشی ارسال شد.' : `❌ ارسال نشد: ${result.error}`);
  } else {
    // بدون گیرنده، فقط اعتبار توکن بررسی می‌شود: لیست گفتگوها.
    const result = await client.conversations();
    console.log(result.ok
      ? '✅ توکن پذیرفته شد (فهرست گفتگوها خوانده شد).'
      : `❌ توکن یا account_id پذیرفته نشد: ${result.error}`);
    console.log('   برای ارسال آزمایشی: npm run instagram:setup -- --send=<IGSID>');
  }
  console.log('');
}

void main();
