import { Global, Module } from '@nestjs/common';
import { CacheService } from './cache.service';

/**
 * کش سراسری.
 *
 * چرا `@Global` و نه provider ساده در AppModule: پنل ادمین باید بتواند بعد از
 * ذخیره‌ی تنظیمات، اتصال کش را بدون ری‌استارت سرویس دوباره بسازد. اگر
 * `CacheService` فقط در AppModule تعریف شود، AdminModule به آن دسترسی ندارد.
 */
@Global()
@Module({ providers: [CacheService], exports: [CacheService] })
export class CacheModule {}
