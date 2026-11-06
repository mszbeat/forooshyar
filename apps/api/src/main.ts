import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { loadConfig } from './config';

async function bootstrap() {
  const config = loadConfig(process.env);
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.use(helmet());
  // Explicit body size limit prevents oversized unauthenticated payloads.
  const express = await import('express');
  app.use(express.json({ limit: '64kb' }));
  app.enableShutdownHooks();
  await app.listen(config.PORT, '0.0.0.0');
}
void bootstrap();
