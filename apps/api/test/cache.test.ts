import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { CacheClient, CacheService, createCacheService } from '../src/cache/cache.service';
import { loadConfig } from '../src/config';

class FakeClient implements CacheClient {
  values = new Map<string, string>();
  expiry = 0;
  closed = false;
  async get(key: string) { return this.values.get(key) ?? null; }
  async set(key: string, value: string, _mode: 'EX', seconds: number) { this.values.set(key, value); this.expiry = seconds; }
  async del(key: string) { this.values.delete(key); }
  disconnect() { this.closed = true; }
}

test('disabled cache does not require or connect to Redis', async () => {
  const cache = createCacheService(loadConfig({ DATABASE_URL: 'postgresql://localhost/db', JWT_SECRET: 'x'.repeat(32) }));
  await cache.set('shop1', 'key', 'value', 30);
  assert.equal(await cache.get('shop1', 'key'), null);
  cache.onModuleDestroy();
});
test('cache keys are tenant scoped and set an expiry', async () => {
  const client = new FakeClient();
  const cache = new CacheService(client);
  await cache.set('shop:1', 'key', 'value', 30);
  assert.equal(client.expiry, 30);
  assert.equal(await cache.get('shop:1', 'key'), 'value');
  assert.equal(await cache.get('shop', '1:key'), null);
  await cache.delete('shop:1', 'key');
  assert.equal(await cache.get('shop:1', 'key'), null);
  cache.onModuleDestroy();
  assert.equal(client.closed, true);
});
test('cache errors become misses and invalid TTLs are rejected', async () => {
  const broken: CacheClient = { get: async () => { throw Error('down'); }, set: async () => { throw Error('down'); }, del: async () => { throw Error('down'); }, disconnect: () => {} };
  const cache = new CacheService(broken);
  assert.equal(await cache.get('shop', 'key'), null);
  await cache.set('shop', 'key', 'value', 1);
  await cache.delete('shop', 'key');
  await assert.rejects(cache.set('shop', 'key', 'value', 0));
});
