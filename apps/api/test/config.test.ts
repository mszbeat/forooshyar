import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { loadConfig } from '../src/config';
const valid = { DATABASE_URL: 'postgresql://user:pass@localhost:5432/db', JWT_SECRET: 'x'.repeat(32) };
test('configuration defaults to port 3001 and disabled cache without Redis', () => {
  const config = loadConfig(valid);
  assert.equal(config.PORT, 3001);
  assert.equal(config.CACHE_ENABLED, false);
});
test('configuration validates Redis when cache is enabled', () => {
  assert.throws(() => loadConfig({ ...valid, CACHE_ENABLED: 'true' }));
  assert.throws(() => loadConfig({ ...valid, CACHE_ENABLED: 'true', REDIS_URL: 'https://example.com' }));
  assert.equal(loadConfig({ ...valid, CACHE_ENABLED: 'true', REDIS_URL: 'redis://localhost:6379' }).CACHE_ENABLED, true);
  assert.equal(loadConfig({ ...valid, CACHE_ENABLED: 'false' }).CACHE_ENABLED, false);
  assert.throws(() => loadConfig({ ...valid, CACHE_ENABLED: 'yes' }));
});
test('configuration rejects weak secrets and invalid databases', () => {
  assert.throws(() => loadConfig({ ...valid, JWT_SECRET: 'short' }));
  assert.throws(() => loadConfig({ ...valid, DATABASE_URL: 'https://example.com' }));
});
