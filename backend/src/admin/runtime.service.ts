import { Injectable, Logger } from '@nestjs/common';
import { CacheService } from '../cache/cache.service';

/** کلیدهایی که با تغییرشان اتصال از پیش ساخته‌شده باید دوباره ساخته شود. */
const LIVE_HOOKS: Record<string, string> = {
  CACHE_ENABLED: 'cache',
  REDIS_URL: 'cache',
};

function safeProviderMessage(message: string, token: string, secret: string): string {
  return message.replaceAll(token, '[redacted]').replaceAll(secret, '[redacted]').slice(0, 240);
}

export type ApplyResult = {
  /** بدون ری‌استارت اثر کرد. */
  hot: string[];
  /** هنوز برای اثر قطعی به ری‌استارت نیاز دارد. */
  restart: string[];
  /** ثبت بیرونی webhook ممکن است به علت تنظیمات یا خطای ارائه‌دهنده انجام نشده باشد. */
  warnings: string[];
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

  async apply(keys: string[]): Promise<ApplyResult> {
    const hooks = new Set(keys.map(key => LIVE_HOOKS[key]).filter(Boolean));
    if (hooks.has('cache')) {
      this.cache.reload();
      this.logger.log('اتصال کش با تنظیمات تازه بازسازی شد.');
    }
    const warnings = await this.refreshMessengerWebhooks(keys);
    // هر کلیدی که هوک زنده دارد، ری‌استارت نمی‌خواهد.
    const restart = keys.filter(key => !LIVE_HOOKS[key] && key === 'DATABASE_URL');
    return { hot: keys.filter(key => !restart.includes(key)), restart, warnings };
  }

  /**
   * Token rotation means a different Rubika/Bale bot identity. Register webhook
   * URLs against the new bot immediately; merely changing process.env leaves
   * the new Rubika bot without endpoints and it will never deliver updates.
   */
  private async refreshMessengerWebhooks(keys: string[]): Promise<string[]> {
    const warnings: string[] = [];
    const changed = (prefix: 'BALE' | 'RUBIKA') => keys.some(key => key === `${prefix}_BOT_TOKEN` || key === `${prefix}_WEBHOOK_SECRET`);
    if (!changed('BALE') && !changed('RUBIKA')) return warnings;

    const publicBase = (process.env.PUBLIC_API_URL ?? process.env.RENDER_EXTERNAL_URL ?? '').trim().replace(/\/+$/, '');
    if (!publicBase.startsWith('https://')) {
      warnings.push('توکن ذخیره شد، اما ثبت webhook خودکار انجام نشد؛ PUBLIC_API_URL را با نشانی HTTPS عمومی API تنظیم کنید.');
      return warnings;
    }

    if (changed('BALE')) {
      const token = (process.env.BALE_BOT_TOKEN ?? '').trim();
      const secret = (process.env.BALE_WEBHOOK_SECRET ?? '').trim();
      if (!token || !secret) warnings.push('وبهوک بله ثبت نشد؛ توکن و سکرت webhook هر دو باید تنظیم باشند.');
      else {
        try {
          const response = await fetch(`https://tapi.bale.ai/bot${token}/setWebhook`, {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ url: `${publicBase}/bale/webhook/${secret}` }),
            signal: AbortSignal.timeout(15000),
          });
          const payload = await response.json().catch(() => ({})) as { ok?: boolean; description?: string };
          if (!response.ok || payload.ok !== true) warnings.push(`ثبت webhook بله ناموفق بود${payload.description ? `: ${safeProviderMessage(payload.description, token, secret)}` : ` (HTTP ${response.status})`}.`);
          else this.logger.log('Webhook بله با توکن/سکرت تازه ثبت شد.');
        } catch {
          warnings.push('ثبت webhook بله به علت خطای شبکه انجام نشد.');
        }
      }
    }

    if (changed('RUBIKA')) {
      const token = (process.env.RUBIKA_BOT_TOKEN ?? '').trim();
      const secret = (process.env.RUBIKA_WEBHOOK_SECRET ?? '').trim();
      if (!token || !secret) warnings.push('وبهوک روبیکا ثبت نشد؛ توکن و سکرت webhook هر دو باید تنظیم باشند.');
      else {
        const endpoints = [
          { url: `${publicBase}/rubika/webhook/${secret}`, type: 'ReceiveUpdate' },
          { url: `${publicBase}/rubika/inline-webhook/${secret}`, type: 'ReceiveInlineMessage' },
        ];
        for (const endpoint of endpoints) {
          try {
            const response = await fetch(`https://botapi.rubika.ir/v3/${encodeURIComponent(token)}/updateBotEndpoints`, {
              method: 'POST', headers: { 'content-type': 'application/json' },
              body: JSON.stringify(endpoint),
              signal: AbortSignal.timeout(15000),
            });
            const payload = await response.json().catch(() => ({})) as { status?: string; success?: boolean; message?: string; error?: string };
            const ok = response.ok && (payload.status?.toUpperCase() === 'OK' || payload.success === true);
            if (!ok) warnings.push(`ثبت endpoint روبیکا (${endpoint.type}) ناموفق بود${payload.message || payload.error ? `: ${safeProviderMessage(payload.message ?? payload.error ?? '', token, secret)}` : ` (HTTP ${response.status})`}.`);
          } catch {
            warnings.push(`ثبت endpoint روبیکا (${endpoint.type}) به علت خطای شبکه انجام نشد.`);
          }
        }
        if (!warnings.some(warning => warning.includes('روبیکا'))) this.logger.log('Webhookهای پیام و کلیک روبیکا با توکن/سکرت تازه ثبت شدند.');
      }
    }
    for (const warning of warnings) this.logger.warn(warning);
    return warnings;
  }
}
