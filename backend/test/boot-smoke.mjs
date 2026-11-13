/**
 * Smoke test بوت اپ روی خروجی کامپایل‌شده (dist) — همان چیزی که روی Render اجرا می‌شود.
 * DI resolve + lazy InstagramService از ModuleRef. بدون دیتابیس واقعی.
 */
process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db?pgbouncer=true&connection_limit=5';
process.env.JWT_SECRET = 'x'.repeat(40);
process.env.CARD_ENCRYPTION_KEY = Buffer.alloc(32, 1).toString('base64');
process.env.CHANNEL_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 2).toString('base64');
process.env.NODE_ENV = 'test';

const { NestFactory } = await import('@nestjs/core');
const { AppModule } = await import('../dist/app.module.js');
const { TelegramService } = await import('../dist/telegram/telegram.service.js');
const { InstagramService } = await import('../dist/instagram/instagram.service.js');

const app = await NestFactory.create(AppModule, { logger: false });
const telegram = app.get(TelegramService, { strict: false });
if (!telegram) throw new Error('TelegramService پیدا نشد');
if (!telegram.db) throw new Error('TelegramService.db تزریق نشده');
if (!telegram.moduleRef) throw new Error('TelegramService.moduleRef تزریق نشده');
const instagram = telegram.moduleRef.get(InstagramService, { strict: false });
if (!instagram) throw new Error('InstagramService از ModuleRef پیدا نشد');
if (typeof instagram.sendFromPanel !== 'function') throw new Error('sendFromPanel نیست');
await app.close();
console.log('BOOT OK: DI resolved, TelegramService + lazy InstagramService reachable');
