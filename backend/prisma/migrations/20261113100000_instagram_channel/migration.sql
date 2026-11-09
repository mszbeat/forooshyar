-- کانال اینستاگرام (BoxAPI): اتصال پیج به فروشگاه + قفل تکرار رویداد webhook.

-- AlterTable
ALTER TABLE "Channel" ADD COLUMN     "instagramAccountId" TEXT,
ADD COLUMN     "instagramLinkedAt" TIMESTAMP(3),
ADD COLUMN     "instagramUsername" TEXT;

-- CreateTable
CREATE TABLE "InstagramEvent" (
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL DEFAULT '',
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InstagramEvent_pkey" PRIMARY KEY ("eventId")
);

-- CreateIndex
CREATE INDEX "InstagramEvent_receivedAt_idx" ON "InstagramEvent"("receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Channel_instagramAccountId_key" ON "Channel"("instagramAccountId");
