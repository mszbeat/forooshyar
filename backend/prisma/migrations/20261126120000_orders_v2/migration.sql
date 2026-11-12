-- V2-3: وضعیت‌های جدید سفارش، هزینه ارسال، رسید پرداخت
CREATE TYPE "ReceiptVerdict" AS ENUM ('CONFIRMED', 'NEEDS_REVIEW', 'REJECTED');

ALTER TABLE "Order"
  ADD COLUMN "subtotal" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "shippingCost" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "shippingMethodId" UUID,
  ADD COLUMN "discount" INTEGER NOT NULL DEFAULT 0;

-- سفارش‌های قدیمی: subtotal همان total بود (بدون ارسال جدا)
UPDATE "Order" SET "subtotal" = "total" WHERE "subtotal" = 0;

-- قید یونیک (shopId, id) که کلید خارجی PaymentReceipt به آن ارجاع می‌دهد؛
-- در schema هست (@@unique) ولی در مهاجرت‌های قبلی ساخته نشده بود.
ALTER TABLE "Order"
  ADD CONSTRAINT "Order_shopId_id_key" UNIQUE ("shopId", "id");

CREATE TABLE "ShippingMethod" (
  "id" TEXT NOT NULL,
  "shopId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'FIXED',
  "baseCost" INTEGER NOT NULL DEFAULT 0,
  "freeOver" INTEGER,
  "rulesJson" JSONB NOT NULL DEFAULT '{}',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ShippingMethod_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ShippingMethod_shopId_id_key"
  ON "ShippingMethod"("shopId", "id");
CREATE INDEX "ShippingMethod_shopId_active_idx"
  ON "ShippingMethod"("shopId", "active");

ALTER TABLE "ShippingMethod"
  ADD CONSTRAINT "ShippingMethod_shopId_fkey"
  FOREIGN KEY ("shopId") REFERENCES "Shop"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Order"
  ADD CONSTRAINT "Order_shippingMethodId_fkey"
  FOREIGN KEY ("shippingMethodId") REFERENCES "ShippingMethod"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "PaymentReceipt" (
  "id" TEXT NOT NULL,
  "shopId" UUID NOT NULL,
  "orderId" UUID NOT NULL,
  "imageRef" TEXT NOT NULL,
  "imageHash" TEXT NOT NULL,
  "extractedJson" JSONB NOT NULL DEFAULT '{}',
  "checksJson" JSONB NOT NULL DEFAULT '[]',
  "verdict" "ReceiptVerdict" NOT NULL DEFAULT 'NEEDS_REVIEW',
  "verdictReason" TEXT NOT NULL DEFAULT '',
  "reviewedBy" UUID,
  "reviewedAt" TIMESTAMP(3),
  "reviewNote" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PaymentReceipt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PaymentReceipt_shopId_id_key"
  ON "PaymentReceipt"("shopId", "id");
CREATE UNIQUE INDEX "PaymentReceipt_shopId_imageHash_key"
  ON "PaymentReceipt"("shopId", "imageHash");
CREATE INDEX "PaymentReceipt_shopId_orderId_idx"
  ON "PaymentReceipt"("shopId", "orderId");
CREATE INDEX "PaymentReceipt_shopId_verdict_idx"
  ON "PaymentReceipt"("shopId", "verdict");

ALTER TABLE "PaymentReceipt"
  ADD CONSTRAINT "PaymentReceipt_shopId_orderId_fkey"
  FOREIGN KEY ("shopId", "orderId") REFERENCES "Order"("shopId", "id")
  ON DELETE CASCADE ON UPDATE CASCADE;
