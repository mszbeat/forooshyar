-- V4 Tasks 5/8/12: product code, variant comboKey unique, post links, cart, automation product link.
-- Lossless: all new columns nullable or with defaults; rollback = drop columns/tables below.

ALTER TABLE "Product" ADD COLUMN "code" TEXT;
CREATE UNIQUE INDEX "Product_shopId_code_key" ON "Product"("shopId", "code") WHERE "code" IS NOT NULL;

ALTER TABLE "Variant" ADD COLUMN "comboKey" TEXT NOT NULL DEFAULT '';
-- Backfill comboKey from optionsJson (keys sorted, "name=value" joined by "|").
UPDATE "Variant" SET "comboKey" = COALESCE(
  (SELECT string_agg(k || '=' || v, '|' ORDER BY k)
   FROM jsonb_each_text("optionsJson"::jsonb) AS kv(k, v)),
  ''
);
CREATE UNIQUE INDEX "Variant_shopId_productId_comboKey_key" ON "Variant"("shopId", "productId", "comboKey");

ALTER TABLE "Automation" ADD COLUMN "productId" UUID;

CREATE TABLE "ProductPostLink" (
  "id" UUID NOT NULL,
  "shopId" UUID NOT NULL,
  "productId" UUID NOT NULL,
  "mediaId" TEXT NOT NULL,
  "shortcode" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProductPostLink_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ProductPostLink_shopId_mediaId_key" ON "ProductPostLink"("shopId", "mediaId");
CREATE INDEX "ProductPostLink_shopId_productId_idx" ON "ProductPostLink"("shopId", "productId");
ALTER TABLE "ProductPostLink" ADD CONSTRAINT "ProductPostLink_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductPostLink" ADD CONSTRAINT "ProductPostLink_shopId_productId_fkey" FOREIGN KEY ("shopId", "productId") REFERENCES "Product"("shopId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "Cart" (
  "id" UUID NOT NULL,
  "shopId" UUID NOT NULL,
  "conversationId" TEXT NOT NULL,
  "itemsJson" JSONB NOT NULL DEFAULT '[]',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Cart_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Cart_shopId_conversationId_key" ON "Cart"("shopId", "conversationId");
CREATE INDEX "Cart_shopId_expiresAt_idx" ON "Cart"("shopId", "expiresAt");
ALTER TABLE "Cart" ADD CONSTRAINT "Cart_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
