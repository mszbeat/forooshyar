-- پاسخ به پیام (ریپلای) در تاریخچه‌ی گفتگو
ALTER TABLE "ChatMessage" ADD COLUMN "replyToId" UUID;
ALTER TABLE "ChatMessage" ADD COLUMN "replyText" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ChatMessage" ADD COLUMN "replyFrom" TEXT NOT NULL DEFAULT '';

-- «اگر موجود شد خبرم کن»
CREATE TABLE "StockAlert" (
    "id" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "chatId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL DEFAULT '',
    "variantId" UUID,
    "notifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StockAlert_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StockAlert_shopId_chatId_productId_key" ON "StockAlert"("shopId", "chatId", "productId");
CREATE INDEX "StockAlert_shopId_productId_notifiedAt_idx" ON "StockAlert"("shopId", "productId", "notifiedAt");

ALTER TABLE "StockAlert" ADD CONSTRAINT "StockAlert_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StockAlert" ADD CONSTRAINT "StockAlert_shopId_productId_fkey" FOREIGN KEY ("shopId", "productId") REFERENCES "Product"("shopId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
