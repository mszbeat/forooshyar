-- V4 Tasks 9/10: per-plan AI/automation/SMS limits. Lossless (defaults 0 = unlimited).
ALTER TABLE "SubscriptionPlan" ADD COLUMN "dailyMessageLimit" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SubscriptionPlan" ADD COLUMN "automationLimit" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SubscriptionPlan" ADD COLUMN "smsLimit" INTEGER NOT NULL DEFAULT 0;
