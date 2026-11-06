import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const databaseUrl = process.env.TEST_DATABASE_URL;
test('real PostgreSQL: auth, tenant isolation and concurrent stock ledger', { skip: !databaseUrl, timeout: 60000 }, async () => {
  const server = createServer();
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  await new Promise<void>(resolve => server.close(() => resolve()));
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const run = randomUUID();
  const emails = [`a-${run}@example.com`, `b-${run}@example.com`];
  const child = spawn(process.execPath, ['dist/main.js'], { cwd: process.cwd(), env: { ...process.env, DATABASE_URL: databaseUrl!, JWT_SECRET: 'test-only-secret-at-least-32-characters-long', CACHE_ENABLED: 'false', PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = '';
  child.stdout.on('data', data => { logs += data.toString(); });
  child.stderr.on('data', data => { logs += data.toString(); });
  const base = `http://127.0.0.1:${port}`;
  const request = async (path: string, method = 'GET', body?: unknown, token?: string) => {
    const res = await fetch(base + path, { method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    return { status: res.status, data: await res.json() as any };
  };
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try { if ((await request('/health')).status === 200) { ready = true; break; } } catch { /* starting */ }
      if (child.exitCode !== null) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(ready, `API did not start: ${logs}`);
    const register = async (email: string) => request('/auth/register', 'POST', { email, password: 'long-test-password', shopName: 'فروشگاه آزمایشی' });
    const a = await register(emails[0]); const b = await register(emails[1]);
    assert.equal(a.status, 201); assert.equal(b.status, 201);
    const tokenA = a.data.accessToken as string; const tokenB = b.data.accessToken as string;
    assert.equal((await request('/auth/login', 'POST', { email: emails[0], password: 'incorrect-password' })).status, 401);
    assert.equal((await request('/products')).status, 401);
    const product = await request('/products', 'POST', { title: 'مانتو آبی' }, tokenA);
    assert.equal(product.status, 201);
    const id = product.data.id as string;
    assert.equal((await request(`/products/${id}`, 'GET', undefined, tokenB)).status, 404);
    assert.equal((await request(`/products/${id}/variants`, 'POST', { price: 100, stock: 5 }, tokenB)).status, 404);
    assert.equal((await request('/products', 'GET', undefined, tokenB)).data.length, 0);
    const variant = await request(`/products/${id}/variants`, 'POST', { price: 1250000, stock: 5, size: '۴۰' }, tokenA);
    assert.equal(variant.status, 201);
    const variantId = variant.data.id as string;
    assert.equal((await request(`/variants/${variantId}/sell`, 'POST', { quantity: 1 }, tokenB)).status, 404);
    assert.equal((await request(`/variants/${variantId}`, 'PATCH', { stock: 500 }, tokenA)).status, 400);
    const results = await Promise.all(Array.from({ length: 20 }, () => request(`/variants/${variantId}/sell`, 'POST', { quantity: 1 }, tokenA)));
    assert.equal(results.filter(r => r.status === 201).length, 5, JSON.stringify(results));
    assert.equal(results.filter(r => r.status === 409).length, 15, JSON.stringify(results));
    const loaded = await request(`/products/${id}`, 'GET', undefined, tokenA);
    assert.equal(loaded.data.variants[0].stock, 0);
    const ledger = await request(`/variants/${variantId}/movements`, 'GET', undefined, tokenA);
    assert.equal(ledger.status, 200);
    assert.equal(ledger.data.length, 6);
    assert.equal(ledger.data.reduce((sum: number, row: { delta: number }) => sum + row.delta, 0), 0);
    assert.equal((await request(`/variants/${variantId}/movements`, 'GET', undefined, tokenB)).status, 404);
    assert.equal((await request(`/variants/${variantId}/stock`, 'POST', { delta: 3, reason: 'restock' }, tokenA)).data.stock, 3);
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM');
      await new Promise<void>(resolve => child.once('exit', () => resolve()));
    }
    const users = await db.user.findMany({ where: { email: { in: emails } }, include: { shop: true } });
    const shopIds = users.flatMap(u => u.shop ? [u.shop.id] : []);
    await db.stockMovement.deleteMany({ where: { shopId: { in: shopIds } } });
    await db.variant.deleteMany({ where: { shopId: { in: shopIds } } });
    await db.product.deleteMany({ where: { shopId: { in: shopIds } } });
    await db.shop.deleteMany({ where: { id: { in: shopIds } } });
    await db.user.deleteMany({ where: { email: { in: emails } } });
    await db.$disconnect();
  }
});
