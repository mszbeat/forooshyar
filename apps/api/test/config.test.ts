import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { loadConfig } from '../src/config';
const valid = { DATABASE_URL: 'postgresql://user:pass@localhost:5432/db', REDIS_URL: 'redis://localhost:6379', JWT_SECRET: 'x'.repeat(32) };
test('configuration supplies a default port', () => assert.equal(loadConfig(valid).PORT, 3001));
test('configuration rejects weak secrets and invalid databases', () => {
  assert.throws(() => loadConfig({ ...valid, JWT_SECRET: 'short' }));
  assert.throws(() => loadConfig({ ...valid, DATABASE_URL: 'https://example.com' }));
});
