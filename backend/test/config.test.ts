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

test('CORS accepts explicit origins and rejects paths and wildcards', () => {
  assert.equal(loadConfig({ ...valid, CORS_ORIGINS: 'https://panel.example.com,http://localhost:3000' }).CORS_ORIGINS, 'https://panel.example.com,http://localhost:3000');
  assert.throws(() => loadConfig({ ...valid, CORS_ORIGINS: '*' }));
  assert.throws(() => loadConfig({ ...valid, CORS_ORIGINS: 'https://panel.example.com/path' }));
  assert.throws(() => loadConfig({ ...valid, CORS_ORIGINS: 'https://panel.example.com/' }));
});

test('separate database fields generate an encoded PostgreSQL URL and validate missing fields', () => {
  const config = loadConfig({ DB_HOST: 'localhost', DB_PORT: '5432', DB_USERNAME: 'seller', DB_PASSWORD: 'a@b:c', DB_NAME: 'shop', JWT_SECRET: 'x'.repeat(32), DB_SSL_MODE: 'verify-full' });
  assert.match(config.DATABASE_URL, /seller:a%40b%3Ac@localhost:5432/);
  assert.match(config.DATABASE_URL, /sslmode=verify-full/);
  assert.throws(() => loadConfig({ DB_HOST: 'localhost', JWT_SECRET: 'x'.repeat(32) }));
  assert.throws(() => loadConfig({ DB_HOST: 'localhost/evil', DB_USERNAME: 'seller', DB_PASSWORD: 'pass', DB_NAME: 'shop', JWT_SECRET: 'x'.repeat(32) }));
});
