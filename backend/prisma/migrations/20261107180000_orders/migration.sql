-- سفارش‌گیری از داخل بات تلگرام + پرداخت
-- موجودی هنگام ساخت سفارش رزرو (کم) می‌شود و در صورت لغو/انقضا برمی‌گردد.

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('AWAITING_PAYMENT', 'PAID', 'SHIPPED', 'COMPLETED', 'CANCELLED');

-- AlterTable
ALTER TABLE "TelegramConversation" ADD COLUMN "draft" JSONB;

-- CreateTable
CREATE TABLE "Order" (
    "id" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'AWAITING_PAYMENT',
    "chatId" TEXT,
    "customerName" TEXT NOT NULL DEFAULT '',
    "customerPhone" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "total" INTEGER NOT NULL,
    "paymentProvider" TEXT NOT NULL DEFAULT '',
    "paymentAuthority" TEXT,
    "paymentRefId" TEXT NOT NULL DEFAULT '',
    "paidAt" TIMESTAMP(3),
    "cancelledReason" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "variantId" UUID,
    "title" TEXT NOT NULL,
    "spec" TEXT NOT NULL DEFAULT '',
    "price" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Order_code_key" ON "Order"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Order_shopId_paymentAuthority_key" ON "Order"("shopId", "paymentAuthority");

-- CreateIndex
CREATE INDEX "Order_shopId_createdAt_idx" ON "Order"("shopId", "createdAt");

-- CreateIndex
CREATE INDEX "Order_shopId_status_idx" ON "Order"("shopId", "status");

-- CreateIndex
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");

-- CreateIndex
CREATE INDEX "OrderItem_shopId_variantId_idx" ON "OrderItem"("shopId", "variantId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_shopId_variantId_fkey" FOREIGN KEY ("shopId", "variantId") REFERENCES "Variant"("shopId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
