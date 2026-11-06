import { Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { AppConfig } from '../config';

export interface CacheClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, expiryMode: 'EX', seconds: number): Promise<unknown>;
  del(key: string): Promise<unknown>;
  disconnect(): void;
}

// Only non-authoritative data may be cached. Price, stock and authorization
// decisions must always be read from PostgreSQL.
@Injectable()
export class CacheService implements OnModuleDestroy {
  constructor(private readonly client: CacheClient | null) {}

  private key(shopId: string, key: string): string {
    if (!shopId || !key) throw new Error('Cache keys require a shop and a key');
    return `shop:${encodeURIComponent(shopId)}:${encodeURIComponent(key)}`;
  }

  async get(shopId: string, key: string): Promise<string | null> {
    const scopedKey = this.key(shopId, key);
    if (!this.client) return null;
    try { return await this.client.get(scopedKey); } catch { return null; }
  }

  async set(shopId: string, key: string, value: string, ttlSeconds: number): Promise<void> {
    const scopedKey = this.key(shopId, key);
    if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds < 1) throw new Error('Cache TTL must be a positive integer');
    if (!this.client) return;
    try { await this.client.set(scopedKey, value, 'EX', ttlSeconds); } catch { /* Cache is best effort. */ }
  }

  async delete(shopId: string, key: string): Promise<void> {
    const scopedKey = this.key(shopId, key);
    if (!this.client) return;
    try { await this.client.del(scopedKey); } catch { /* Cache is best effort. */ }
  }

  onModuleDestroy(): void { this.client?.disconnect(); }
}

export function createCacheService(config: AppConfig): CacheService {
  if (!config.CACHE_ENABLED) return new CacheService(null);
  if (!config.REDIS_URL) throw new Error('REDIS_URL is required when cache is enabled');
  const client = new Redis(config.REDIS_URL, {
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
  return new CacheService(client);
}
