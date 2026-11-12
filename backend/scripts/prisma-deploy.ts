/**
 * `prisma migrate deploy` با مدیریت خودکار مهاجرت‌های ناموفق.
 *
 * چرا: اگر یک مهاجرت وسط اجرا به‌خاطر قطع اتصال (مثلاً پر شدن pooler)
 * ناموفق شود، Prisma آن را در `_prisma_migrations` failed علامت می‌زند و
 * `migrate deploy` بعدی با خطای P3009 رد می‌شود — حتی اگر مهاجرت هیچ
 * تغییری در دیتابیس نداده باشد.
 *
 * در Postgres، DDL تراکنشی است: مهاجرت ناموفق کامل rollback شده و هیچ
 * تغییری اعمال نشده. پس امن است آن را `--rolled-back` علامت بزنیم و
 * deploy را دوباره امتحان کنیم. این اسکریپت دقیقاً همین کار را می‌کند:
 *   ۱) migrate deploy
 *   ۲) اگر P3009 بود، مهاجرت‌های failed را rolled-back کن
 *   ۳) migrate deploy دوباره (فقط یک بار)
 */
import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import { migrationDatabaseUrl } from '../src/config';

const url = migrationDatabaseUrl(process.env);
if (!url) throw new Error('Set DIRECT_URL, or DB_HOST, DB_USERNAME, DB_PASSWORD and DB_NAME (or legacy DATABASE_URL)');

const bin = require.resolve('prisma/build/index.js');
const env = { ...process.env, DATABASE_URL: url, DIRECT_URL: url };

function run(args: string[]): { status: number; output: string } {
  const result = spawnSync(process.execPath, [bin, ...args], { encoding: 'utf8', env });
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  process.stdout.write(output);
  return { status: result.status ?? 1, output };
}

const first = run(['migrate', 'deploy']);
if (first.status === 0) process.exit(0);

if (!/P3009|failed migrations/i.test(first.output)) {
  process.exit(first.status);
}

console.log('\n[prisma-deploy] مهاجرت ناموفقی پیدا شد؛ چون DDL در Postgres تراکنشی است، آن را rolled-back علامت می‌زنیم و دوباره امتحان می‌کنیم.\n');

// نام مهاجرت‌های failed را از خروجی P3009 استخراج کن
const names = [...first.output.matchAll(/The `([^`]+)` migration started at/g)].map(m => m[1]);
const unique = [...new Set(names)];
if (unique.length === 0) {
  console.error('[prisma-deploy] نتوانستم نام مهاجرت ناموفق را از خروجی بخوانم؛ deploy متوقف شد.');
  process.exit(first.status);
}

for (const name of unique) {
  const resolved = run(['migrate', 'resolve', '--rolled-back', name]);
  if (resolved.status !== 0) {
    console.error(`[prisma-deploy] resolve برای ${name} ناموفق بود.`);
    process.exit(resolved.status);
  }
  console.log(`[prisma-deploy] ${name} به‌عنوان rolled-back علامت خورد.`);
}

const second = run(['migrate', 'deploy']);
process.exit(second.status);
