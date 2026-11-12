-- V2-6: take-over گفتگو و منبع پاسخ AI
ALTER TABLE "TelegramConversation"
  ADD COLUMN "humanTakeover" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "lastReplySource" TEXT NOT NULL DEFAULT '';
