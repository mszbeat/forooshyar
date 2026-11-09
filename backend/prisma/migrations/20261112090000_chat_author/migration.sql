-- نویسندهٔ پیام گفتگو: مشتری، بات یا فروشنده.
ALTER TABLE "ChatMessage" ADD COLUMN "author" TEXT NOT NULL DEFAULT 'customer';

-- پرکردن گذشته: هر پیام خروجی تا امروز یا از بات آمده یا از فروشنده؛ هر دو در
-- پنل سمت چپ (فروشگاه) نمایش داده می‌شوند، پس برچسب پیش‌فرض «بات» درست است.
UPDATE "ChatMessage" SET "author" = 'bot' WHERE "direction" = 'out';

CREATE INDEX "ChatMessage_shopId_author_idx" ON "ChatMessage"("shopId", "author");
