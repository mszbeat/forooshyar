import { Controller, Get, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthController } from './auth/auth.controller';
import { AuthGuard } from './auth/auth.guard';
import { AuthService } from './auth/auth.service';
import { CacheService, createCacheService } from './cache/cache.service';
import { CatalogController } from './catalog/catalog.controller';
import { CatalogService } from './catalog/catalog.service';
import { loadConfig } from './config';
import { PrismaService } from './database/prisma.service';
import { ShopController } from './shop/shop.controller';
import { ImportController } from './imports/import.controller';
import { ImportService } from './imports/import.service';
import { FreshController } from './fresh/fresh.controller';

@Controller('health')
class HealthController { @Get() health() { return { status: 'ok' }; } }
@Module({
  imports: [JwtModule.registerAsync({ useFactory: () => ({ secret: loadConfig(process.env).JWT_SECRET, signOptions: { expiresIn: '1h', algorithm: 'HS256' } }) }), ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }])],
  controllers: [HealthController, AuthController, ShopController, CatalogController, ImportController, FreshController],
  providers: [PrismaService, AuthGuard, AuthService, CatalogService, ImportService, { provide: CacheService, useFactory: () => createCacheService(loadConfig(process.env)) }, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
