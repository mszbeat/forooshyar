import { Controller, Get, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthController } from './auth/auth.controller';
import { AuthGuard } from './auth/auth.guard';
import { AuthService } from './auth/auth.service';
import { CacheService, createCacheService } from './cache/cache.service';
import { CatalogController } from './catalog/catalog.controller';
import { CatalogService } from './catalog/catalog.service';
import { loadConfig } from './config';
import { DatabaseModule } from './database/database.module';
import { PrismaService } from './database/prisma.service';
import { LoggingModule } from './logging/logging.module';
import { RequestContextMiddleware } from './logging/logging.middleware';
import { AllExceptionsFilter } from './logging/http-exception.filter';
import { ShopController } from './shop/shop.controller';
import { ImportController } from './imports/import.controller';
import { ImportService } from './imports/import.service';
import { FreshController } from './fresh/fresh.controller';
import { ReportsController } from './reports/reports.controller';
import { ReportsService } from './reports/reports.service';

@Controller('health')
class HealthController { @Get() health() { return { status: 'ok' }; } }
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), DatabaseModule, LoggingModule, JwtModule.registerAsync({ global: true, useFactory: () => ({ secret: loadConfig(process.env).JWT_SECRET, signOptions: { expiresIn: '1h', algorithm: 'HS256' } }) }), ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }])],
  controllers: [HealthController, AuthController, ShopController, CatalogController, ImportController, FreshController, ReportsController],
  providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }, PrismaService, AuthGuard, AuthService, CatalogService, ImportService, ReportsService, { provide: CacheService, useFactory: () => createCacheService(loadConfig(process.env)) }, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Every route gets a request id + log context before anything else runs.
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
