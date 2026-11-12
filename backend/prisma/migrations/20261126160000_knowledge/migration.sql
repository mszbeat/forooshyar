-- V2-7: دانش Q&A و پرامپت‌های دستیار با نسخه
CREATE TABLE "KnowledgeItem" (
  "id" TEXT NOT NULL,
  "shopId" UUID NOT NULL,
  "question" TEXT NOT NULL,
  "answer" TEXT NOT NULL,
  "keywords" TEXT NOT NULL DEFAULT '',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "KnowledgeItem_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "KnowledgeItem_shopId_id_key" ON "KnowledgeItem"("shopId", "id");
CREATE INDEX "KnowledgeItem_shopId_active_idx" ON "KnowledgeItem"("shopId", "active");
ALTER TABLE "KnowledgeItem"
  ADD CONSTRAINT "KnowledgeItem_shopId_fkey"
  FOREIGN KEY ("shopId") REFERENCES "Shop"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AssistantPrompt" (
  "id" TEXT NOT NULL,
  "shopId" UUID NOT NULL,
  "tab" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AssistantPrompt_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AssistantPrompt_shopId_id_key" ON "AssistantPrompt"("shopId", "id");
CREATE INDEX "AssistantPrompt_shopId_tab_version_idx" ON "AssistantPrompt"("shopId", "tab", "version");
ALTER TABLE "AssistantPrompt"
  ADD CONSTRAINT "AssistantPrompt_shopId_fkey"
  FOREIGN KEY ("shopId") REFERENCES "Shop"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
