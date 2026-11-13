-- ارائه‌دهنده‌ی Meta (API رسمی اینستاگرام) در کنار BoxAPI:
-- توکن بلندمدت رمزنگاری‌شده‌ی هر فروشگاه + نام ارائه‌دهنده‌ی اتصال.
ALTER TABLE "Channel" ADD COLUMN "instagramProvider" TEXT NOT NULL DEFAULT 'boxapi';
ALTER TABLE "Channel" ADD COLUMN "instagramAccessToken" TEXT;
