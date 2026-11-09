-- اتصال پیج اینستاگرام به هر فروشگاه (چندمستأجری).
-- نسخه‌ی اول، account_id را از env می‌خواند که برای یک پنل چندفروشگاهی غلط بود؛
-- از این پس هر فروشگاه پیج خودش را در `Channel` نگه می‌دارد.

-- AlterTable
ALTER TABLE "Channel" ADD COLUMN     "instagramProfilePhoto" TEXT,
ADD COLUMN     "instagramExpiresAt" TIMESTAMP(3);
