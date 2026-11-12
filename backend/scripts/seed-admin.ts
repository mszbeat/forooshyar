/**
 * ساخت/به‌روزرسانی حساب ادمین از روی متغیرهای محیطی — بدون هیچ رمز در کد.
 *
 * استفاده:
 *   ADMIN_SEED_EMAIL=you@example.com ADMIN_SEED_PASSWORD='...' npm run prisma:seed-admin
 *
 * رفتار:
 *  - اگر متغیرها نباشند، با پیام واضح رد می‌شود (بدون خطا).
 *  - اگر حساب نباشد ساخته می‌شود و mustChangePassword=true می‌گیرد.
 *  - اگر حساب باشد، رمز به‌روزرسانی نمی‌شود (تا اجرای دوباره ناخواسته رمز
 *    را عوض نکند) مگر ADMIN_SEED_FORCE=1 باشد.
 *  - رمز هرگز لاگ نمی‌شود؛ فقط هش scrypt ذخیره می‌شود.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/auth/password';

async function main() {
  const email = (process.env.ADMIN_SEED_EMAIL ?? '').trim().toLowerCase();
  const password = (process.env.ADMIN_SEED_PASSWORD ?? '').trim();
  const force = process.env.ADMIN_SEED_FORCE === '1';

  if (!email || !password) {
    console.log('ADMIN_SEED_EMAIL / ADMIN_SEED_PASSWORD تنظیم نشده است؛ seed ادمین رد شد.');
    console.log('برای ساخت حساب ادمین، هر دو متغیر را بگذارید و دوباره اجرا کنید.');
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('ADMIN_SEED_EMAIL معتبر نیست.');
  }
  if (password.length < 12) {
    throw new Error('رمز ادمین باید دست‌کم ۱۲ کاراکتر باشد.');
  }

  const db = new PrismaClient();
  try {
    const existing = await db.platformAdmin.findUnique({ where: { email } });
    if (existing && !force) {
      console.log(`حساب ادمین ${email} از قبل وجود دارد؛ رمز تغییر نکرد. (برای به‌روزرسانی: ADMIN_SEED_FORCE=1)`);
      return;
    }
    const passwordHash = await hashPassword(password);
    if (existing) {
      await db.platformAdmin.update({
        where: { id: existing.id },
        data: { passwordHash, mustChangePassword: true },
      });
      console.log(`رمز ادمین ${email} به‌روزرسانی شد و باید در اولین ورود عوض شود.`);
    } else {
      await db.platformAdmin.create({
        data: { email, passwordHash, name: 'مدیر سامانه', mustChangePassword: true },
      });
      console.log(`حساب ادمین ${email} ساخته شد و باید در اولین ورود رمز را عوض کند.`);
    }
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error('seed ادمین ناموفق بود:', error instanceof Error ? error.message : 'unknown');
  process.exit(1);
});
