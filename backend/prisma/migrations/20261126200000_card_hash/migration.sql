-- V4-1: هش شماره کارت برای تشخیص تکراری
ALTER TABLE "ShopPaymentMethod" ADD COLUMN "cardHash" TEXT NOT NULL DEFAULT '';
