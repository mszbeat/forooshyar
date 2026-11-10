import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import helmet from 'helmet';
import { applyOverrides } from './admin/settings.runtime';
import { AppModule } from './app.module';
import { databaseUrl, loadConfig, resolveHost } from './config';

/**
 * تنظیماتی که ادمین در پنل ذخیره کرده، **قبل از** ساخت اپ روی `process.env`
 * اعمال می‌شود.
 *
 * چرا این‌قدر زود: بخشی از پیکربندی هنگام ساخت ماژول خوانده و قفل می‌شود
 * (CORS، کش، اتصال Prisma، کلاینت تلگرام). اگر بعد از `NestFactory.create`
 * اعمال شود، تغییر `CORS_ORIGINS` یا `DATABASE_URL` تا ری‌استارت بعدی هیچ
 * اثری ندارد و کاربر فکر می‌کند پنل خراب است.
 *
 * اگر دیتابیس در دسترس نباشد، سرویس با همان env بالا می‌آید (هیچ‌وقت به‌خاطر
 * این مرحله بوت نمی‌شکند).
 */
async function applyPanelSettings(logger: Logger): Promise<void> {
  const url = databaseUrl(process.env);
  if (!url) return;
  const client = new PrismaClient({ datasources: { db: { url } } });
  try {
    const rows = await Promise.race([
      client.appSetting.findMany({ select: { key: true, value: true } }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
    ]);
    const { applied } = applyOverrides(rows);
    if (applied.length) logger.log(`تنظیمات پنل ادمین پیش از بوت اعمال شد: ${applied.join('، ')}`);
  } catch (error) {
    logger.warn(`اعمال تنظیمات پنل ادمین انجام نشد (${error instanceof Error ? error.message : 'unknown'}); با متغیرهای محیطی ادامه می‌دهیم.`);
  } finally {
    await client.$disconnect().catch(() => undefined);
  }
}

async function bootstrap() {
  await applyPanelSettings(new Logger('Bootstrap'));
  const config = loadConfig(process.env);
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.use(helmet());
  // مبدأهای مجاز در **هر درخواست** از env خوانده می‌شود تا تغییر `CORS_ORIGINS`
  // در پنل ادمین بدون ری‌استارت سرویس اثر کند (قبلاً یک‌بار در بوت خوانده می‌شد).
  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true); // curl/بات/تلگرام مبدأ ندارند
      const allowed = (process.env.CORS_ORIGINS ?? config.CORS_ORIGINS)
        .split(',').map(value => value.trim()).filter(Boolean);
      return callback(null, allowed.length === 0 || allowed.includes(origin));
    },
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
    credentials: false,
  });
  app.enableShutdownHooks();
  // توجه: بدنه‌ی درخواست در AppModule.configure() پارس می‌شود (قبل از init).
  // اینجا هیچ app.init()/express.json() دوباره‌ای نگذار: پارس بعد از init بی‌اثر
  // است و همان باگی بود که POST /auth/register را در build کامپایل‌شده ۵۰۰ می‌کرد.

  const host = resolveHost();
  await app.listen(config.PORT, host);

  const logger = new Logger('Bootstrap');
  logger.log(`listening on http://${host}:${config.PORT}${host === '0.0.0.0' ? ' (همه‌ی اینترفیس‌ها)' : ''}`);
  if ((host === '127.0.0.1' || host === '::1') && process.env.PORT) {
    logger.warn(
      `HOST=${host} است ولی PORT از بیرون تزریق شده؛ تقریباً همیشه یعنی پورت دیده نمی‌شود. ` +
      'روی Render/Railway/Fly مقدار HOST=0.0.0.0 را بگذار.',
    );
  }
}

void bootstrap();
