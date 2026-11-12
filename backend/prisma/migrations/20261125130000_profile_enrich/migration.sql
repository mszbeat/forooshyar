-- Track the last BoxAPI profile-enrichment attempt per conversation so we
-- don't call BoxAPI repeatedly for the same customer (cache + backfill).
ALTER TABLE "TelegramConversation" ADD COLUMN "profileEnrichedAt" TIMESTAMP(3);
