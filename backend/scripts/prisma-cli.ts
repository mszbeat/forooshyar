import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import { migrationDatabaseUrl } from '../src/config';

/**
 * مهاجرت‌ها روی اتصال session/direct (پورت 5432) اجرا می‌شوند، نه pooler
 * تراکنشی (6543) — روی 6543 گیر می‌کنند. `migrationDatabaseUrl` اگر
 * DIRECT_URL ست نشده باشد، از DB_* همان URL را می‌سازد ولی پورت را 5432
 * می‌کند و پارامترهای pgbouncer را حذف می‌کند.
 */
const url = migrationDatabaseUrl(process.env);
if (!url) throw new Error('Set DIRECT_URL, or DB_HOST, DB_USERNAME, DB_PASSWORD and DB_NAME (or legacy DATABASE_URL)');
const bin = require.resolve('prisma/build/index.js');
// Prisma همه‌ی envهای ارجاع‌شده در schema (DATABASE_URL و DIRECT_URL) را
// اجباری می‌داند؛ هر دو را روی همین URL می‌گذاریم تا اعتبارسنجی P1012 ندهد.
const result = spawnSync(process.execPath, [bin, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url },
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
