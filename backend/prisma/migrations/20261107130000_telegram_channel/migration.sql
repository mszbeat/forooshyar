-- CreateTable
CREATE TABLE "Channel" (
    "id" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "ownerCode" TEXT,
    "ownerChat" TEXT,
    "ownerLinkedAt" TIMESTAMP(3),
    "botUsername" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Channel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramConversation" (
    "id" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "chatId" TEXT NOT NULL,
    "username" TEXT NOT NULL DEFAULT '',
    "firstName" TEXT NOT NULL DEFAULT '',
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramUpdate" (
    "updateId" BIGINT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramUpdate_pkey" PRIMARY KEY ("updateId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Channel_shopId_key" ON "Channel"("shopId");

-- CreateIndex
CREATE UNIQUE INDEX "Channel_code_key" ON "Channel"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Channel_ownerCode_key" ON "Channel"("ownerCode");

-- CreateIndex
CREATE INDEX "Channel_active_idx" ON "Channel"("active");

-- CreateIndex
CREATE INDEX "TelegramConversation_shopId_lastSeenAt_idx" ON "TelegramConversation"("shopId", "lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramConversation_shopId_chatId_key" ON "TelegramConversation"("shopId", "chatId");

-- CreateIndex
CREATE INDEX "TelegramUpdate_receivedAt_idx" ON "TelegramUpdate"("receivedAt");

-- AddForeignKey
ALTER TABLE "Channel" ADD CONSTRAINT "Channel_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramConversation" ADD CONSTRAINT "TelegramConversation_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

