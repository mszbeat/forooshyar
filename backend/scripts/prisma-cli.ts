import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import { databaseUrl } from '../src/config';

/**
 * مهاجرت‌ها روی اتصال مستقیم/session اجرا می‌شوند، نه pooler تراکنشی:
 * pooler تراکنشی (پورت 6543) برای runtime است و `migrate deploy` روی آن
 * کار نمی‌کند. اگر DIRECT_URL ست شده باشد همان استفاده می‌شود؛ در غیر
 * این صورت DATABASE_URL (یا DB_*) — برای نصب‌های بدون pooler.
 */
const directUrl = (process.env.DIRECT_URL ?? '').trim();
const url = directUrl || databaseUrl(process.env);
if (!url) throw new Error('Set DIRECT_URL, or DB_HOST, DB_USERNAME, DB_PASSWORD and DB_NAME (or legacy DATABASE_URL)');
const bin = require.resolve('prisma/build/index.js');
const result = spawnSync(process.execPath, [bin, ...process.argv.slice(2)], { stdio: 'inherit', env: { ...process.env, DATABASE_URL: url } });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
