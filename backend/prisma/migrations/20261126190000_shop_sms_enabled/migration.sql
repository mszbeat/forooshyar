-- V3-2: کلید ارسال پیامک به‌ازای هر فروشگاه
ALTER TABLE "Shop" ADD COLUMN "smsEnabled" BOOLEAN NOT NULL DEFAULT true;
