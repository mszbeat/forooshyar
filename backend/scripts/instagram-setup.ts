import 'dotenv/config';
import { readInstagramConfig, instagramConfigured, instagramConnectable, webhookUrl } from '../src/instagram/instagram.config';
import { InstagramClient } from '../src/instagram/instagram.client';

/**
 * بررسی اتصال اینستاگرام بدون بالا آوردن کل سرور.
 *
 * چرا لازم است: اولین جایی که اتصال می‌شکند، مقادیر env و فهرست پیج‌هاست و
 * خطاهای BoxAPI هم کلی‌اند («unauthorized»). این اسکریپت همان‌ها را چاپ می‌کند،
 * پیج‌های متصل را لیست می‌کند و آدرس webhook را نشان می‌دهد.
 *
 * پیج را **اینجا ست نمی‌کنیم**: هر فروشگاه پیج خودش را از پنل وصل می‌کند.
 * این اسکریپت فقط می‌گوید روی حساب باکس‌ای‌پی چه پیج‌هایی لاگین شده‌اند تا
 * بتوانید بررسی کنید که لینک ورود درست کار کرده است.
 *
 * اجرا:  npm run instagram:setup
 *
 * توکن و سکرت **چاپ نمی‌شوند** — نه کامل، نه ماسک‌شده.
 */

const config = readInstagramConfig();

function line(label: string, value: string, ok?: boolean): void {
  const mark = ok === undefined ? '·' : ok ? '✅' : '⚠️';
  console.log(`${mark} ${label}: ${value}`);
}

function mask(id: string): string {
  return id.length <= 8 ? `${id.slice(0, 4)}…` : `${id.slice(0, 8)}…${id.slice(-4)}`;
}

async function main(): Promise<void> {
  console.log('\n— بررسی اتصال اینستاگرام (BoxAPI) —\n');
  line('آدرس پایه', config.baseUrl);
  line('توکن دسترسی (پلتفرم)', config.apiKey ? 'ست شده' : 'ست نشده', Boolean(config.apiKey));
  line('سکرت webhook', config.webhookSecret ? 'ست شده (امضا فعال)' : 'ست نشده (امضا غیرفعال!)', Boolean(config.webhookSecret));
  line('لینک ورود فروشگاه‌ها', instagramConnectable(config) ? 'ست شده' : 'ست نشده — پنل نمی‌تواند دکمه‌ی اتصال نشان دهد', instagramConnectable(config));
  line('آدرس webhook', webhookUrl(config) || 'ست نشده — PUBLIC_API_URL را بگذارید', webhookUrl(config).startsWith('https://'));

  if (!instagramConfigured(config)) {
    console.log('\n⛔ INSTAGRAM_API_KEY را از داشبورد BoxAPI پر کنید و دوباره اجرا کنید.\n');
    return;
  }

  console.log('\n— پیج‌های لاگین‌شده روی این حساب —');
  const client = new InstagramClient(config);
  const listed = await client.listAccounts();
  if (!listed.ok) {
    console.log(`❌ فهرست پیج‌ها خوانده نشد: ${listed.error}`);
    console.log('   (توکن اشتباه، منقضی، یا دسترسی پلن؟)\n');
    return;
  }
  if (listed.data.length === 0) {
    console.log('⚠️ هیچ پیجی لاگین نیست. لینک ورود را باز کنید و پیج فروشگاه را اجازه بدهید:');
    console.log(`   ${config.loginUrl || '(INSTAGRAM_LOGIN_URL ست نشده)'}`);
  } else {
    for (const account of listed.data) {
      const expires = account.expiresAt
        ? `انقضا: ${new Date(account.expiresAt).toLocaleDateString('fa-IR')}`
        : 'بدون تاریخ انقضا';
      console.log(`   • @${account.username || '—'}  id=${mask(account.id)}  ${account.active ? 'فعال' : 'غیرفعال'} · ${expires}`);
    }
    console.log('\nاین پیج‌ها در پنل، تنظیمات → دایرکت اینستاگرام، برای انتخاب نمایش داده می‌شوند.');
  }
  console.log('');
}

void main();
