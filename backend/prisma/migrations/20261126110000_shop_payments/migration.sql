-- V2-2: روش پرداخت کارت‌به‌کارت فروشگاه + سیاست رسید
ALTER TABLE "Shop"
  ADD COLUMN "receiptAutoConfirm" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "receiptAutoConfirmMax" INTEGER,
  ADD COLUMN "paymentWaitHours" INTEGER NOT NULL DEFAULT 24;

CREATE TABLE "ShopPaymentMethod" (
  "id" TEXT NOT NULL,
  "shopId" UUID NOT NULL,
  "holderName" TEXT NOT NULL,
  "cardNumberEnc" TEXT NOT NULL,
  "cardLast4" TEXT NOT NULL,
  "bankName" TEXT NOT NULL DEFAULT '',
  "sheba" TEXT NOT NULL DEFAULT '',
  "instruction" TEXT NOT NULL DEFAULT '',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ShopPaymentMethod_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ShopPaymentMethod_shopId_id_key"
  ON "ShopPaymentMethod"("shopId", "id");
CREATE INDEX "ShopPaymentMethod_shopId_active_idx"
  ON "ShopPaymentMethod"("shopId", "active");

ALTER TABLE "ShopPaymentMethod"
  ADD CONSTRAINT "ShopPaymentMethod_shopId_fkey"
  FOREIGN KEY ("shopId") REFERENCES "Shop"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
