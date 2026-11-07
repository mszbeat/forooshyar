import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { loadConfig, resolveHost } from './config';

async function bootstrap() {
  const config = loadConfig(process.env);
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.use(helmet());
  const origins = config.CORS_ORIGINS.split(',').map(value => value.trim()).filter(Boolean);
  app.enableCors({ origin: origins, methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'], credentials: false });
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
