import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { actionFor, entityIdFrom, isMutating } from '../src/logging/actions';
import { AuditService } from '../src/logging/audit.service';
import { newRequestId, redact, runWithContext } from '../src/logging/request-context';
import type { PrismaService } from '../src/database/prisma.service';

const UUID = '3f0f9a3e-1d2b-4c5d-8e9f-0a1b2c3d4e5f';

test('route names map to stable actions', () => {
  assert.equal(actionFor('POST', '/auth/login').action, 'auth.login');
  assert.equal(actionFor('POST', '/products').action, 'product.create');
  assert.equal(actionFor('GET', '/products').action, 'product.list');
  assert.equal(actionFor('PATCH', `/products/${UUID}`).action, 'product.update');
  assert.equal(actionFor('DELETE', `/products/${UUID}`).action, 'product.archive');
  assert.equal(actionFor('POST', `/products/${UUID}/variants`).action, 'variant.create');
  assert.equal(actionFor('POST', `/variants/${UUID}/sell`).action, 'variant.sell');
  assert.equal(actionFor('POST', `/variants/${UUID}/stock`).action, 'variant.stock_adjust');
  assert.equal(actionFor('PATCH', '/shop').action, 'shop.update');
  assert.equal(actionFor('POST', '/imports').action, 'catalog.import');
  assert.equal(actionFor('GET', '/audit').action, 'audit.read');
  // nothing is ever unlabelled
  assert.equal(actionFor('GET', '/whatever/deep/path').action, 'whatever.read');
});

test('entity ids are extracted but never confused with route words', () => {
  assert.equal(entityIdFrom(`/products/${UUID}/variants`), UUID);
  assert.equal(entityIdFrom('/products'), undefined);
});

test('only mutating verbs are treated as writes', () => {
  assert.equal(isMutating('POST'), true);
  assert.equal(isMutating('DELETE'), true);
  assert.equal(isMutating('GET'), false);
});

test('secrets are redacted and long text is truncated', () => {
  const value = redact({
    email: 'a@b.co',
    password: 'hunter2',
    authorization: 'Bearer x',
    nested: { accessToken: 'token', note: 'x'.repeat(900) },
    list: [1, 2, 3],
  }) as Record<string, unknown>;

  assert.equal(value.email, 'a@b.co');
  assert.equal(value.password, '[redacted]');
  assert.equal(value.authorization, '[redacted]');
  assert.equal((value.nested as Record<string, unknown>).accessToken, '[redacted]');
  assert.match(String((value.nested as Record<string, unknown>).note), /…$/);
  assert.deepEqual(value.list, [1, 2, 3]);
});

test('request ids are unique and url-safe', () => {
  const ids = new Set(Array.from({ length: 500 }, () => newRequestId()));
  assert.equal(ids.size, 500);
  for (const id of ids) assert.match(id, /^req_[a-z0-9]+$/);
});

type Row = Record<string, unknown>;
function fakeDb(): { db: PrismaService; rows: Row[]; fail: () => void } {
  const rows: Row[] = [];
  let shouldFail = false;
  const db = {
    auditLog: {
      create: async ({ data }: { data: Row }) => {
        if (shouldFail) throw new Error('db down');
        rows.push(data);
        return data;
      },
    },
  } as unknown as PrismaService;
  return { db, rows, fail: () => { shouldFail = true; } };
}

test('mutating requests are persisted, reads only go to stdout', async () => {
  const { db, rows } = fakeDb();
  const audit = new AuditService(db, false);

  audit.write({ requestId: 'req_1', action: 'product.create', method: 'POST', path: '/products', statusCode: 201, success: true, durationMs: 12, shopId: 's1', userId: 'u1' });
  audit.write({ requestId: 'req_2', action: 'product.list', method: 'GET', path: '/products', statusCode: 200, success: true, durationMs: 3, shopId: 's1' });

  await new Promise(resolve => setImmediate(resolve));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].action, 'product.create');
});

test('failed reads and failed writes are always persisted', async () => {
  const { db, rows } = fakeDb();
  const audit = new AuditService(db, false);
  audit.write({ requestId: 'r1', action: 'product.list', method: 'GET', path: '/products', statusCode: 500, success: false, durationMs: 5, errorMessage: 'boom' });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].success, false);
});

test('AUDIT_LOG_READS stores reads too', async () => {
  const { db, rows } = fakeDb();
  const audit = new AuditService(db, true);
  audit.write({ requestId: 'r1', action: 'product.list', method: 'GET', path: '/products', statusCode: 200, success: true, durationMs: 2 });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(rows.length, 1);
});

test('a failing audit insert never throws into the request', async () => {
  const { db, fail } = fakeDb();
  const audit = new AuditService(db, false);
  fail();
  assert.doesNotThrow(() => audit.write({ requestId: 'r1', action: 'product.create', method: 'POST', path: '/products', statusCode: 201, success: true, durationMs: 1 }));
  await new Promise(resolve => setImmediate(resolve));
});

test('service-level events inherit the request context', async () => {
  const { db, rows } = fakeDb();
  const audit = new AuditService(db, false);

  await new Promise<void>(resolve => {
    runWithContext({ requestId: 'req_ctx', method: 'POST', path: '/variants/x/sell', ip: '1.2.3.4' }, () => {
      audit.record({ action: 'variant.sell', entity: 'variant', entityId: 'v1', meta: { quantity: 2 } });
      setImmediate(resolve);
    });
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].requestId, 'req_ctx');
  assert.equal(rows[0].shopId, null);
  assert.equal(rows[0].ip, '1.2.3.4');
});
