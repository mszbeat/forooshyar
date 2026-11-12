import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { describePooler, warnOnRiskyPooler } from '../src/config';

/**
 * تشخیص حالت pooler و هشدار اتصال پرریسک.
 * این تست‌ها بدون دیتابیس اجرا می‌شوند و فقط روی URL کار می‌کنند.
 */
describe('describePooler', () => {
  it('transaction pooler on port 6543', () => {
    const result = describePooler('postgresql://user:pass@host:6543/postgres?pgbouncer=true&connection_limit=5');
    assert.equal(result.mode, 'transaction');
    assert.equal(result.connectionLimit, 5);
    assert.equal(result.pgbouncer, true);
  });

  it('session pooler on port 5432 with pooler hostname', () => {
    const result = describePooler('postgresql://user:pass@aws-0-xxx.pooler.supabase.com:5432/postgres');
    assert.equal(result.mode, 'session');
  });

  it('direct connection on port 5432', () => {
    const result = describePooler('postgresql://user:pass@db.example.com:5432/postgres');
    assert.equal(result.mode, 'direct');
  });

  it('invalid URL returns unknown without throwing', () => {
    const result = describePooler('not-a-url');
    assert.equal(result.mode, 'unknown');
  });
});

describe('warnOnRiskyPooler', () => {
  it('warns on session mode with high connection limit', () => {
    const warnings: string[] = [];
    const logs: string[] = [];
    warnOnRiskyPooler('postgresql://u:p@x.pooler.supabase.com:5432/db?connection_limit=50', {
      warn: (m) => warnings.push(m),
      log: (m) => logs.push(m),
    });
    assert.ok(warnings.length >= 1, 'should warn about risky session pooler');
    assert.ok(logs.length >= 1, 'should log pooler mode');
  });

  it('does not warn on transaction mode with pgbouncer', () => {
    const warnings: string[] = [];
    warnOnRiskyPooler('postgresql://u:p@host:6543/db?pgbouncer=true&connection_limit=5', {
      warn: (m) => warnings.push(m),
      log: () => {},
    });
    assert.equal(warnings.length, 0);
  });

  it('warns when port 6543 is used without pgbouncer=true', () => {
    const warnings: string[] = [];
    warnOnRiskyPooler('postgresql://u:p@host:6543/db', {
      warn: (m) => warnings.push(m),
      log: () => {},
    });
    assert.ok(warnings.length >= 1);
  });
});
