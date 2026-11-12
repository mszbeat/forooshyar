-- V2-9: بسته‌های اعتبار پاسخ AI و دفتر حسابداری
CREATE TABLE "CreditPack" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "credits" INTEGER NOT NULL,
  "price" INTEGER NOT NULL,
  "listPrice" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT false,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CreditPack_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CreditPack_slug_key" ON "CreditPack"("slug");

CREATE TABLE "AiCreditLedger" (
  "id" TEXT NOT NULL,
  "shopId" UUID NOT NULL,
  "delta" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "refId" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiCreditLedger_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AiCreditLedger_shopId_createdAt_idx" ON "AiCreditLedger"("shopId", "createdAt");
ALTER TABLE "AiCreditLedger"
  ADD CONSTRAINT "AiCreditLedger_shopId_fkey"
  FOREIGN KEY ("shopId") REFERENCES "Shop"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- بسته‌های پیش‌فرض (قیمت‌ها placeholder و قابل ویرایش‌اند)
INSERT INTO "CreditPack" ("id", "slug", "name", "credits", "price", "listPrice", "active", "sortOrder", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'pack-100', 'بسته‌ی ۱۰۰ پاسخ', 100, 49000, 0, true, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'pack-500', 'بسته‌ی ۵۰۰ پاسخ', 500, 199000, 249000, true, 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'pack-2000', 'بسته‌ی ۲۰۰۰ پاسخ', 2000, 690000, 0, true, 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
