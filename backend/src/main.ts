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
  app.enableShutdownHooks();
  // Init before the body parser so the request-context/logging middleware is the
  // first thing a request touches: a malformed JSON body (400) is then logged
  // too, instead of being rejected before the audit trail sees it.
  await app.init();
  // Explicit body size limit prevents oversized unauthenticated payloads.
  const express = await import('express');
  app.use(express.json({ limit: '64kb' }));
  // Bind to loopback in production (Nginx proxies to it); HOST=0.0.0.0 for a container.
  await app.listen(config.PORT, process.env.HOST ?? '127.0.0.1');
}
void bootstrap();
