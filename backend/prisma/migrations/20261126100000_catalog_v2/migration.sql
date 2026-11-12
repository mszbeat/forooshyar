-- V2-1: نوع محصول/خدمت، ویژگی‌های K-V، گزینه‌های واریانت
CREATE TYPE "ProductType" AS ENUM ('PRODUCT', 'SERVICE');

ALTER TABLE "Product"
  ADD COLUMN "type" "ProductType" NOT NULL DEFAULT 'PRODUCT',
  ADD COLUMN "isShippable" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "defaultPrice" INTEGER,
  ADD COLUMN "defaultStock" INTEGER,
  ADD COLUMN "compareAtPrice" INTEGER,
  ADD COLUMN "serviceDurationMinutes" INTEGER,
  ADD COLUMN "serviceRequiresBooking" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "serviceCapacity" INTEGER;

CREATE TABLE "ProductAttribute" (
  "id" TEXT NOT NULL,
  "shopId" UUID NOT NULL,
  "productId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "ProductAttribute_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductAttributeValue" (
  "id" TEXT NOT NULL,
  "shopId" UUID NOT NULL,
  "attributeId" UUID NOT NULL,
  "value" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "ProductAttributeValue_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProductAttribute_shopId_productId_name_key"
  ON "ProductAttribute"("shopId", "productId", "name");
CREATE UNIQUE INDEX "ProductAttributeValue_shopId_attributeId_value_key"
  ON "ProductAttributeValue"("shopId", "attributeId", "value");
CREATE INDEX "ProductAttribute_shopId_productId_idx"
  ON "ProductAttribute"("shopId", "productId");
CREATE INDEX "ProductAttributeValue_shopId_attributeId_idx"
  ON "ProductAttributeValue"("shopId", "attributeId");

ALTER TABLE "ProductAttribute"
  ADD CONSTRAINT "ProductAttribute_shopId_productId_fkey"
  FOREIGN KEY ("shopId", "productId") REFERENCES "Product"("shopId", "id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductAttributeValue"
  ADD CONSTRAINT "ProductAttributeValue_shopId_attributeId_fkey"
  FOREIGN KEY ("shopId", "attributeId") REFERENCES "ProductAttribute"("shopId", "id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Variant" ADD COLUMN "optionsJson" JSONB NOT NULL DEFAULT '{}';

-- بک‌فیل: واریانت‌های موجود از size/color
UPDATE "Variant" SET "optionsJson" = jsonb_build_object(
  'سایز', "size", 'رنگ', "color"
) WHERE "size" <> '' OR "color" <> '';

-- بک‌فیل: ویژگی‌های «سایز»/«رنگ» برای محصولاتی که واریانت دارند
INSERT INTO "ProductAttribute" ("id", "shopId", "productId", "name", "sortOrder")
SELECT gen_random_uuid()::text, "shopId", "productId", 'سایز', 0
FROM "Variant" WHERE "size" <> ''
GROUP BY "shopId", "productId"
ON CONFLICT DO NOTHING;

INSERT INTO "ProductAttribute" ("id", "shopId", "productId", "name", "sortOrder")
SELECT gen_random_uuid()::text, "shopId", "productId", 'رنگ', 1
FROM "Variant" WHERE "color" <> ''
GROUP BY "shopId", "productId"
ON CONFLICT DO NOTHING;

INSERT INTO "ProductAttributeValue" ("id", "shopId", "attributeId", "value", "sortOrder")
SELECT gen_random_uuid()::text, v."shopId", a."id", v."size", 0
FROM "Variant" v
JOIN "ProductAttribute" a
  ON a."shopId" = v."shopId" AND a."productId" = v."productId" AND a."name" = 'سایز'
WHERE v."size" <> ''
ON CONFLICT DO NOTHING;

INSERT INTO "ProductAttributeValue" ("id", "shopId", "attributeId", "value", "sortOrder")
SELECT gen_random_uuid()::text, v."shopId", a."id", v."color", 0
FROM "Variant" v
JOIN "ProductAttribute" a
  ON a."shopId" = v."shopId" AND a."productId" = v."productId" AND a."name" = 'رنگ'
WHERE v."color" <> ''
ON CONFLICT DO NOTHING;
