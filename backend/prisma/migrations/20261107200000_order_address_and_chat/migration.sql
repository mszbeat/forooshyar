-- نشانی ساختیافته برای سفارش‌ها + پیام‌های فروشنده/مشتری

-- AlterTable
ALTER TABLE "Order"
  ADD COLUMN "province"   TEXT NOT NULL DEFAULT '',
  ADD COLUMN "city"       TEXT NOT NULL DEFAULT '',
  ADD COLUMN "street"     TEXT NOT NULL DEFAULT '',
  ADD COLUMN "alley"      TEXT NOT NULL DEFAULT '',
  ADD COLUMN "plaque"     TEXT NOT NULL DEFAULT '',
  ADD COLUMN "unit"       TEXT NOT NULL DEFAULT '',
  ADD COLUMN "postalCode" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "chatId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "orderId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChatMessage_shopId_chatId_createdAt_idx" ON "ChatMessage"("shopId", "chatId", "createdAt");

-- CreateIndex
CREATE INDEX "ChatMessage_shopId_createdAt_idx" ON "ChatMessage"("shopId", "createdAt");

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
