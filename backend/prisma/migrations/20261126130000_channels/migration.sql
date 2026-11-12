-- V2-4: اتصال‌های کانال (اینستاگرام/تلگرام/بله/روبیکا)
CREATE TYPE "ChannelPlatform" AS ENUM ('INSTAGRAM', 'TELEGRAM', 'BALE', 'RUBIKA');
CREATE TYPE "ChannelConnectionStatus" AS ENUM ('CONNECTED', 'EXPIRED', 'DISCONNECTED', 'ERROR');

CREATE TABLE "ChannelConnection" (
  "id" TEXT NOT NULL,
  "shopId" UUID NOT NULL,
  "platform" "ChannelPlatform" NOT NULL,
  "status" "ChannelConnectionStatus" NOT NULL DEFAULT 'CONNECTED',
  "displayName" TEXT NOT NULL DEFAULT '',
  "username" TEXT NOT NULL DEFAULT '',
  "avatarUrl" TEXT NOT NULL DEFAULT '',
  "externalId" TEXT NOT NULL DEFAULT '',
  "secretEnc" TEXT NOT NULL DEFAULT '',
  "expiresAt" TIMESTAMP(3),
  "lastSeenAt" TIMESTAMP(3),
  "lastError" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ChannelConnection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChannelConnection_shopId_platform_externalId_key"
  ON "ChannelConnection"("shopId", "platform", "externalId");
CREATE INDEX "ChannelConnection_shopId_platform_idx"
  ON "ChannelConnection"("shopId", "platform");
CREATE INDEX "ChannelConnection_platform_externalId_idx"
  ON "ChannelConnection"("platform", "externalId");

ALTER TABLE "ChannelConnection"
  ADD CONSTRAINT "ChannelConnection_shopId_fkey"
  FOREIGN KEY ("shopId") REFERENCES "Shop"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
