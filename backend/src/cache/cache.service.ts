import { Inject, Injectable, OnModuleDestroy, Optional } from '@nestjs/common';
import Redis from 'ioredis';
import type { AppConfig } from '../config';

export const CACHE_CLIENT = 'CACHE_CLIENT';

export interface CacheClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, expiryMode: 'EX', seconds: number): Promise<unknown>;
  del(key: string): Promise<unknown>;
  disconnect(): void;
}

// Only non-authoritative data may be cached. Price, stock and authorization
// decisions must always be read from PostgreSQL.
/**
 * کش به‌صورت **تنبل** ساخته می‌شود و می‌تواند بدون ری‌استارت سرویس عوض شود.
 *
 * چرا: پنل ادمین می‌تواند `CACHE_ENABLED`/`REDIS_URL` را تغییر دهد. اگر کلاینت
 * در لحظه‌ی بوت ساخته شود، این تغییر تا ری‌استارت بی‌اثر می‌ماند. حالا اتصال با
 * اولین استفاده و بر اساس env فعلی ساخته می‌شود و `reload()` آن را دوباره
 * می‌سازد؛ تنظیمات پنل هم همین را صدا می‌زند.
 */
@Injectable()
export class CacheService implements OnModuleDestroy {
  private client: CacheClient | null = null;
  private signature = '';
  private built = false;

  /**
   * @param injected کلاینت تزریق‌شده (تست یا جایگزین دلخواه). اگر داده شود،
   *                 کش از env ساخته نمی‌شود و `reload` کاری نمی‌کند.
   */
  constructor(@Optional() @Inject(CACHE_CLIENT) private readonly injected: CacheClient | null = null) {}

  private key(shopId: string, key: string): string {
    if (!shopId || !key) throw new Error('Cache keys require a shop and a key');
    return `shop:${encodeURIComponent(shopId)}:${encodeURIComponent(key)}`;
  }

  /** آیا کش الان فعال است (برای وضعیت پنل). */
  get enabled(): boolean {
    return (process.env.CACHE_ENABLED ?? '').trim() === 'true' && Boolean((process.env.REDIS_URL ?? '').trim());
  }

  private ensure(): CacheClient | null {
    if (this.injected) return this.injected;
    const wanted = this.enabled;
    const signature = `${wanted ? '1' : '0'}|${(process.env.REDIS_URL ?? '').trim()}`;
    if (this.built && signature === this.signature) return this.client;
    // اتصال قبلی بسته می‌شود تا سوکت مرده باقی نماند.
    try { this.client?.disconnect(); } catch { /* best effort */ }
    this.client = null;
    this.built = true;
    this.signature = signature;
    if (!wanted) return null;
    try {
      const client = new Redis((process.env.REDIS_URL ?? '').trim(), {
        lazyConnect: true,
        enableOfflineQueue: false,
        connectTimeout: 1000,
        commandTimeout: 1000,
        maxRetriesPerRequest: 0,
        retryStrategy: (attempt) => Math.min(attempt * 500, 5000),
      });
      // ioredis emits errors independently of rejected commands. Do not log URLs or credentials.
      client.on('error', () => {});
      void client.connect().catch(() => {});
      this.client = client;
    } catch {
      this.client = null;
    }
    return this.client;
  }

  /** اتصال را با تنظیمات فعلی دوباره می‌سازد (بدون ری‌استارت سرویس). */
  reload(): void {
    if (this.injected) return;
    this.built = false;
    this.ensure();
  }

  async get(shopId: string, key: string): Promise<string | null> {
    const scopedKey = this.key(shopId, key);
    const client = this.ensure();
    if (!client) return null;
    try { return await client.get(scopedKey); } catch { return null; }
  }

  async set(shopId: string, key: string, value: string, ttlSeconds: number): Promise<void> {
    const scopedKey = this.key(shopId, key);
    if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds < 1) throw new Error('Cache TTL must be a positive integer');
    const client = this.ensure();
    if (!client) return;
    try { await client.set(scopedKey, value, 'EX', ttlSeconds); } catch { /* Cache is best effort. */ }
  }

  async delete(shopId: string, key: string): Promise<void> {
    const scopedKey = this.key(shopId, key);
    const client = this.ensure();
    if (!client) return;
    try { await client.del(scopedKey); } catch { /* Cache is best effort. */ }
  }

  onModuleDestroy(): void {
    try { (this.injected ?? this.client)?.disconnect(); } catch { /* best effort */ }
    this.client = null;
  }
}

/**
 * سازنده‌ی سازگار با نسخه‌ی قبلی.
 *
 * از این به بعد اتصال در اولین استفاده و بر اساس env ساخته می‌شود (تا تغییر
 * تنظیمات از پنل ادمین بدون ری‌استارت اثر کند)، پس پارامتر `config` فقط برای
 * خوانایی امضا نگه داشته شده است.
 */
export function createCacheService(_config?: AppConfig): CacheService {
  return new CacheService();
}
