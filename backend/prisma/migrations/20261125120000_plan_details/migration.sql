-- جزئیات پلن‌ها برای صفحه‌ی قیمت‌گذاری و جزئیات خرید.
ALTER TABLE "SubscriptionPlan" ADD COLUMN "slug" TEXT;
ALTER TABLE "SubscriptionPlan" ADD COLUMN "tagline" TEXT NOT NULL DEFAULT '';
ALTER TABLE "SubscriptionPlan" ADD COLUMN "features" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "SubscriptionPlan" ADD COLUMN "listMonthlyPrice" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SubscriptionPlan" ADD COLUMN "monthlyMessageLimit" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SubscriptionPlan" ADD COLUMN "productLimit" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SubscriptionPlan" ADD COLUMN "isPopular" BOOLEAN NOT NULL DEFAULT false;

-- slug برای ردیف‌های قدیمی: بر اساس ترتیب ساخت.
-- تابع پنجره‌ای (ROW_NUMBER) مستقیم در UPDATE مجاز نیست؛ با زیرکوئری انجام می‌شود.
UPDATE "SubscriptionPlan" AS sp
SET "slug" = 'plan-' || sub.rn::text
FROM (
  SELECT id, ROW_NUMBER() OVER (ORDER BY "sortOrder", "createdAt") AS rn
  FROM "SubscriptionPlan"
  WHERE "slug" IS NULL
) AS sub
WHERE sp.id = sub.id;
ALTER TABLE "SubscriptionPlan" ALTER COLUMN "slug" SET NOT NULL;
CREATE UNIQUE INDEX "SubscriptionPlan_slug_key" ON "SubscriptionPlan"("slug");

ALTER TABLE "Subscription" ADD COLUMN "extraInstagram" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Subscription" ADD COLUMN "discountCode" TEXT NOT NULL DEFAULT '';

CREATE TABLE "DiscountCode" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "percent" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DiscountCode_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DiscountCode_code_key" ON "DiscountCode"("code");
