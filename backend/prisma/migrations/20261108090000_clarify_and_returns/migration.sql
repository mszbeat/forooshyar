-- سیاست مرجوعی فروشگاه (بات بدون آن به انسان ارجاع می‌دهد)
ALTER TABLE "Shop" ADD COLUMN "returns" TEXT NOT NULL DEFAULT '';

-- وضعیت «سؤال روشن‌کننده» برای هر گفتگو
ALTER TABLE "TelegramConversation" ADD COLUMN "clarify" JSONB;
