import { Injectable, Logger } from '@nestjs/common';
import { CacheService } from '../cache/cache.service';

/** کلیدهایی که با تغییرشان اتصال از پیش ساخته‌شده باید دوباره ساخته شود. */
const LIVE_HOOKS: Record<string, string> = {
  CACHE_ENABLED: 'cache',
  REDIS_URL: 'cache',
};

export type ApplyResult = {
  /** بدون ری‌استارت اثر کرد. */
  hot: string[];
  /** هنوز برای اثر قطعی به ری‌استارت نیاز دارد. */
  restart: string[];
};

/**
 * «اعمال فوری» تنظیمات پنل ادمین.
 *
 * چرا لازم است: بیشتر تنظیمات (مدل، توکن بات، سکرت webhook، CORS، پیام‌های
 * فروشگاه) در لحظه‌ی استفاده از `process.env` خوانده می‌شوند و ذخیره‌شان کافی
 * است. اما چند اتصال (کش Redis، دیتابیس) در بوت ساخته می‌شوند. این سرویس آن
 * اتصال‌ها را بعد از ذخیره از نو می‌سازد تا ادمین مجبور به ری‌استارت سرویس
 * نشود؛ و صادقانه می‌گوید چه چیزی واقعاً ری‌استارت می‌خواهد.
 */
@Injectable()
export class RuntimeService {
  private readonly logger = new Logger('Runtime');

  constructor(private readonly cache: CacheService) {}

  apply(keys: string[]): ApplyResult {
    const hooks = new Set(keys.map(key => LIVE_HOOKS[key]).filter(Boolean));
    if (hooks.has('cache')) {
      this.cache.reload();
      this.logger.log('اتصال کش با تنظیمات تازه بازسازی شد.');
    }
    // هر کلیدی که هوک زنده دارد، ری‌استارت نمی‌خواهد.
    const restart = keys.filter(key => !LIVE_HOOKS[key] && key === 'DATABASE_URL');
    return { hot: keys.filter(key => !restart.includes(key)), restart };
  }
}
