-- V2-5: اتوماسیون کامنت به دایرکت
CREATE TABLE "InboundCommentEvent" (
  "id" TEXT NOT NULL,
  "shopId" UUID NOT NULL,
  "commentId" TEXT NOT NULL,
  "mediaId" TEXT NOT NULL DEFAULT '',
  "senderId" TEXT NOT NULL DEFAULT '',
  "text" TEXT NOT NULL DEFAULT '',
  "rawJson" JSONB NOT NULL DEFAULT '{}',
  "processedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InboundCommentEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "InboundCommentEvent_shopId_commentId_key"
  ON "InboundCommentEvent"("shopId", "commentId");
CREATE INDEX "InboundCommentEvent_shopId_createdAt_idx"
  ON "InboundCommentEvent"("shopId", "createdAt");
ALTER TABLE "InboundCommentEvent"
  ADD CONSTRAINT "InboundCommentEvent_shopId_fkey"
  FOREIGN KEY ("shopId") REFERENCES "Shop"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "Automation" (
  "id" TEXT NOT NULL,
  "shopId" UUID NOT NULL,
  "name" TEXT NOT NULL DEFAULT 'اتوماسیون کامنت به دایرکت',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "scope" TEXT NOT NULL DEFAULT 'ALL',
  "mediaIdsJson" JSONB NOT NULL DEFAULT '[]',
  "triggerWordsJson" JSONB NOT NULL DEFAULT '[]',
  "publicRepliesJson" JSONB NOT NULL DEFAULT '[]',
  "dmTemplate" TEXT NOT NULL DEFAULT '',
  "requireFollow" BOOLEAN NOT NULL DEFAULT false,
  "dailyCap" INTEGER NOT NULL DEFAULT 200,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Automation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Automation_shopId_id_key" ON "Automation"("shopId", "id");
CREATE INDEX "Automation_shopId_active_idx" ON "Automation"("shopId", "active");
ALTER TABLE "Automation"
  ADD CONSTRAINT "Automation_shopId_fkey"
  FOREIGN KEY ("shopId") REFERENCES "Shop"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AutomationRun" (
  "id" TEXT NOT NULL,
  "shopId" UUID NOT NULL,
  "automationId" UUID NOT NULL,
  "commentId" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "detail" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AutomationRun_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AutomationRun_shopId_automationId_createdAt_idx"
  ON "AutomationRun"("shopId", "automationId", "createdAt");
CREATE INDEX "AutomationRun_shopId_commentId_idx"
  ON "AutomationRun"("shopId", "commentId");
ALTER TABLE "AutomationRun"
  ADD CONSTRAINT "AutomationRun_shopId_automationId_fkey"
  FOREIGN KEY ("shopId", "automationId") REFERENCES "Automation"("shopId", "id")
  ON DELETE CASCADE ON UPDATE CASCADE;
