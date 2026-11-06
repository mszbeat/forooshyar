import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { loadConfig } from './config';

async function bootstrap() {
  const config = loadConfig(process.env);
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.use(helmet());
  const origins = config.CORS_ORIGINS.split(',').map(value => value.trim()).filter(Boolean);
  app.enableCors({ origin: origins, methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'], credentials: false });
  // Explicit body size limit prevents oversized unauthenticated payloads.
  const express = await import('express');
  app.use(express.json({ limit: '64kb' }));
  app.enableShutdownHooks();
  await app.listen(config.PORT, '0.0.0.0');
}
void bootstrap();
