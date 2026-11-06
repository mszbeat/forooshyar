import 'reflect-metadata';
import { Controller, Get, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { loadConfig } from './config';

@Controller('health')
class HealthController {
  @Get() health() { return { status: 'ok' }; }
}
@Module({ controllers: [HealthController] })
class AppModule {}

async function bootstrap() {
  const config = loadConfig(process.env);
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  await app.listen(config.PORT, '0.0.0.0');
}
void bootstrap();
