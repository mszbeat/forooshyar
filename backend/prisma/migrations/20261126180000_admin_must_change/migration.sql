-- V3-1.4: ادمین seedشده باید در اولین ورود رمز را عوض کند
ALTER TABLE "PlatformAdmin" ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
