ALTER TABLE "User" ADD COLUMN "phone" TEXT, ADD COLUMN "phoneVerifiedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");
ALTER TABLE "Shop" ADD COLUMN "smsPhone" TEXT NOT NULL DEFAULT '', ADD COLUMN "notifySellerBySms" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "SubscriptionPlan" ADD COLUMN "description" TEXT NOT NULL DEFAULT '';
CREATE TABLE "OtpChallenge" ("id" UUID NOT NULL DEFAULT gen_random_uuid(), "phone" TEXT NOT NULL, "userId" UUID, "purpose" TEXT NOT NULL, "codeHash" TEXT NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL, "attempts" INTEGER NOT NULL DEFAULT 0, "consumedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "OtpChallenge_pkey" PRIMARY KEY ("id"));
CREATE INDEX "OtpChallenge_phone_purpose_createdAt_idx" ON "OtpChallenge"("phone", "purpose", "createdAt");
CREATE INDEX "OtpChallenge_expiresAt_idx" ON "OtpChallenge"("expiresAt");
