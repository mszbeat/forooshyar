// End-to-end verification of the catalog files against the real import endpoint.
// Registers a throwaway shop so the demo shop is left untouched.
const BASE = process.env.API || 'http://127.0.0.1:3001';
import fs from 'node:fs';
import path from 'node:path';

async function json(pathname, options = {}) {
  const res = await fetch(BASE + pathname, options);
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

async function upload(file, token) {
  const form = new FormData();
  form.append('file', new Blob([fs.readFileSync(file)]), path.basename(file));
  return json('/catalog/import', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function newShop(label) {
  const email = `import-test-${label}-${Date.now()}@example.com`;
  // /auth/register is rate limited to 5 requests per minute; wait it out instead
  // of failing, so one run can create a shop per file.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const reg = await json('/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'throwaway-password-123', shopName: `فروشگاه تست ${label}` }),
    });
    if (reg.status === 201 || reg.status === 200) return reg.data.accessToken;
    if (reg.status === 429) { await sleep(21000); continue; }
    throw new Error('register failed: ' + JSON.stringify(reg));
  }
  throw new Error('register rate limited for too long');
}

async function main() {
  let lastToken = '';
  for (const file of ['forooshyar-catalog-30.csv', 'forooshyar-catalog-30.xlsx', 'forooshyar-import-errors-demo.csv']) {
    // Each file gets its own fresh shop: SKUs are unique per shop, so importing
    // the same catalog twice into one shop is expected to collide.
    const token = await newShop(path.basename(file).replace(/[^a-z0-9]+/gi, '-').slice(0, 20));
    lastToken = token;
    const started = Date.now();
    const result = await upload(file, token);
    const ms = Date.now() - started;
    if (result.status === 201 || result.status === 200) {
      const body = result.data;
      console.log(`\n✅ ${file}  (${ms}ms)`);
      console.log(`   imported=${body.imported}  failed=${body.failed}`);
      for (const row of body.results.filter(r => r.status === 'error')) {
        console.log(`   ⚠️ row ${row.row}: ${(row.errors || []).join(' | ').slice(0, 110)}`);
      }
    } else {
      console.log(`\n❌ ${file}  HTTP ${result.status}: ${JSON.stringify(result.data).slice(0, 400)}`);
    }
  }

  const products = await json('/products', { headers: { Authorization: `Bearer ${lastToken}` } });
  console.log(`\nproducts in the last throwaway shop: ${products.data.length}`);
  console.log(`products with stock > 0: ${products.data.filter(p => p.variants.some(v => v.stock > 0)).length}`);
}

main().catch(error => { console.error(error); process.exit(1); });
