import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import ExcelJS from 'exceljs';

const databaseUrl = process.env.TEST_DATABASE_URL;
test('real PostgreSQL: auth, tenant isolation and concurrent stock ledger', { skip: !databaseUrl, timeout: 60000 }, async () => {
  const server = createServer();
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  await new Promise<void>(resolve => server.close(() => resolve()));
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const run = randomUUID();
  const emails = [`a-${run}@example.com`, `b-${run}@example.com`];
  const child = spawn(process.execPath, ['dist/main.js'], { cwd: process.cwd(), env: { ...process.env, DATABASE_URL: databaseUrl!, JWT_SECRET: 'test-only-secret-at-least-32-characters-long', CACHE_ENABLED: 'false', CORS_ORIGINS: 'https://panel.example.com', PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
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
    const preflight = await fetch(base + '/products', { method: 'OPTIONS', headers: { Origin: 'https://panel.example.com', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type' } });
    assert.equal(preflight.headers.get('access-control-allow-origin'), 'https://panel.example.com');
    const rejectedOrigin = await fetch(base + '/health', { headers: { Origin: 'https://evil.example.com' } });
    assert.equal(rejectedOrigin.headers.get('access-control-allow-origin'), null);
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
    const upload = async (token: string | undefined, name: string, bytes: Buffer) => {
      const form = new FormData();
      form.append('file', new Blob([new Uint8Array(bytes)]), name);
      const response = await fetch(base + '/catalog/import', { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: form });
      return { status: response.status, data: await response.json() as any };
    };
    const csv = Buffer.from('نام محصول,قیمت,موجودی,سایز,رنگ,sku\nمانتو,۱۲۵۰۰۰۰,۳,۴۰,آبی,S1\nکیف,not-a-price,۲,,,S2\nشلوار,۳۰۰,۱,,,S1\n');
    assert.equal((await upload(undefined, 'catalog.csv', csv)).status, 401);
    const imported = await upload(tokenA, 'catalog.csv', csv);
    assert.equal(imported.status, 201, JSON.stringify(imported));
    assert.equal(imported.data.imported, 1);
    assert.equal(imported.data.failed, 2);
    assert.deepEqual(imported.data.results.map((r: any) => r.row), [2, 3, 4]);
    const importedId = imported.data.results[0].productId;
    const importedVariantId = imported.data.results[0].variantId;
    const importedProduct = await request(`/products/${importedId}`, 'GET', undefined, tokenA);
    assert.equal(importedProduct.data.variants[0].price, 1250000);
    assert.equal(importedProduct.data.variants[0].stock, 3);
    const importedLedger = await request(`/variants/${importedVariantId}/movements`, 'GET', undefined, tokenA);
    assert.equal(importedLedger.data[0].delta, 3);
    assert.equal(importedLedger.data[0].reason, 'import');
    assert.equal((await request(`/products/${importedId}`, 'GET', undefined, tokenB)).status, 404);
    const otherShop = await upload(tokenB, 'catalog.csv', Buffer.from('title,price,stock,sku\nدیگر,42,0,S1\n'));
    assert.equal(otherShop.data.imported, 1);
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Products');
    sheet.addRow(['title', 'price', 'stock', 'color']);
    sheet.addRow(['کفش', 250000, 2, 'مشکی']);
    sheet.addRow(['فرمول', { formula: '1+1', result: 2 }, 1, '']);
    const excel = await upload(tokenA, 'catalog.xlsx', Buffer.from(await workbook.xlsx.writeBuffer()));
    assert.equal(excel.status, 201, JSON.stringify(excel));
    assert.equal(excel.data.imported, 1);
    assert.equal(excel.data.failed, 1);
    assert.equal((await upload(tokenA, 'fake.xlsx', Buffer.from('not an archive'))).status, 400);
    assert.equal((await upload(tokenA, 'bad.csv', Buffer.from('title,stock\nX,2\n'))).status, 400);
    assert.equal((await upload(tokenA, 'oversize.csv', Buffer.alloc(2 * 1024 * 1024 + 1))).status, 413);

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
