ALTER TABLE "Shop" ADD COLUMN "trialStartedAt" TIMESTAMP(3), ADD COLUMN "trialEndsAt" TIMESTAMP(3);
UPDATE "Shop" SET "trialStartedAt" = CURRENT_TIMESTAMP, "trialEndsAt" = CURRENT_TIMESTAMP + INTERVAL '6 days' WHERE "trialEndsAt" IS NULL;
CREATE TABLE "SubscriptionPlan" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "name" TEXT NOT NULL, "monthlyPrice" INTEGER NOT NULL DEFAULT 0,
  "instagramLimit" INTEGER NOT NULL, "telegramLimit" INTEGER NOT NULL, "active" BOOLEAN NOT NULL DEFAULT false,
  "sortOrder" INTEGER NOT NULL DEFAULT 0, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SubscriptionPlan_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SubscriptionPlan_active_sortOrder_idx" ON "SubscriptionPlan"("active", "sortOrder");
CREATE TABLE "Subscription" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "shopId" UUID NOT NULL, "planId" UUID NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING', "months" INTEGER NOT NULL, "amount" INTEGER NOT NULL,
  "authority" TEXT, "referenceId" TEXT NOT NULL DEFAULT '', "startsAt" TIMESTAMP(3), "endsAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Subscription_authority_key" ON "Subscription"("authority");
CREATE INDEX "Subscription_shopId_status_endsAt_idx" ON "Subscription"("shopId", "status", "endsAt");
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
