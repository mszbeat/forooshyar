-- افزودنی پیامک سفارش (opt-in با هزینه‌ی اضافه، قابل خرید بعدی در پنل)
ALTER TABLE "SubscriptionPlan" ADD COLUMN "orderSmsMonthlyPrice" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SubscriptionPlan" ADD COLUMN "orderSmsIncluded" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Subscription" ADD COLUMN "orderSms" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Shop" ADD COLUMN "orderSmsEnabled" BOOLEAN NOT NULL DEFAULT false;
