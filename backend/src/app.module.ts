import { Controller, Get, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { jsonBodyParser } from './logging/body-error.middleware';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { Injectable, HttpException } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthController } from './auth/auth.controller';
import { AuthGuard } from './auth/auth.guard';
import { AuthService } from './auth/auth.service';
import { CacheModule } from './cache/cache.module';
import { RealtimeModule } from './realtime/realtime.module';
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
import { TelegramModule } from './telegram/telegram.module';
import { OrdersModule } from './orders/orders.module';
import { AiModule } from './ai/ai.module';
import { AdminModule } from './admin/admin.module';
import { InstagramModule } from './instagram/instagram.module';

// پیام پیش‌فرض Throttler انگلیسی است و پنل همان را به کاربر نشان می‌دهد.
@Injectable()
class PersianThrottlerGuard extends ThrottlerGuard {
  protected async throwThrottlingException(): Promise<void> {
    throw new HttpException(
      { statusCode: 429, message: 'تعداد درخواست‌ها زیاد بود؛ چند لحظه بعد دوباره تلاش کنید.' },
      429,
    );
  }
}

/**
 * ریشه‌ی API. وجودش عمدی است: اگر Health Check یک سرویس ابری (Render، Railway،
 * Fly و …) روی `/` تنظیم شود — که پیش‌فرض Render است — بدون این روت پاسخ ۴۰۴ بود
 * و **دیپلوی به‌خاطر health check شکست می‌خورد**، در حالی که خود سرویس سالم بود.
 * باید کنترلر جدا باشد؛ `@Controller('health')` + `@Get('/')` مسیر `/` نمی‌سازد.
 */
@Controller()
class RootController {
  @Get()
  root() { return { service: 'forooshyar-api', status: 'ok', health: '/health' }; }
}

@Controller('health')
class HealthController {
  /** Liveness فقط؛ دیتابیس را تست نمی‌کند. Health Check سرویس روی همین است. */
  @Get() health() { return { status: 'ok' }; }
}
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), RealtimeModule, CacheModule, DatabaseModule, LoggingModule, JwtModule.registerAsync({ global: true, useFactory: () => ({ secret: loadConfig(process.env).JWT_SECRET, signOptions: { expiresIn: '1h', algorithm: 'HS256' } }) }), ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]), AiModule, AdminModule, TelegramModule, OrdersModule, InstagramModule],
  controllers: [RootController, HealthController, AuthController, ShopController, CatalogController, ImportController, FreshController, ReportsController],
  providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }, PrismaService, AuthGuard, AuthService, CatalogService, ImportService, ReportsService, { provide: APP_GUARD, useClass: PersianThrottlerGuard }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Order matters: request id + log context first, then body parsing.
    // Explicit 64kb limit prevents oversized unauthenticated payloads.
    consumer
      .apply(RequestContextMiddleware, jsonBodyParser)
      .forRoutes('*');
  }
}
