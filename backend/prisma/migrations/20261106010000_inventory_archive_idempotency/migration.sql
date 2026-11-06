ALTER TABLE "Variant" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;
CREATE TABLE "StockOperation" (
  "id" UUID NOT NULL,
  "shopId" UUID NOT NULL,
  "variantId" UUID NOT NULL,
  "requestKey" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL CHECK ("quantity" > 0),
  "resultStock" INTEGER CHECK ("resultStock" >= 0),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StockOperation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "StockOperation_shopId_requestKey_key" ON "StockOperation"("shopId", "requestKey");
CREATE INDEX "StockOperation_shopId_variantId_idx" ON "StockOperation"("shopId", "variantId");
ALTER TABLE "StockOperation" ADD CONSTRAINT "StockOperation_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockOperation" ADD CONSTRAINT "StockOperation_shopId_variantId_fkey" FOREIGN KEY ("shopId", "variantId") REFERENCES "Variant"("shopId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
