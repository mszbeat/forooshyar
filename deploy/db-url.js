#!/usr/bin/env node
/**
 * DATABASE_URL را از متغیرهای DB_* می‌سازد و در stdout چاپ می‌کند.
 *
 * چرا لازم است: خود API آدرس دیتابیس را از DB_* می‌سازد
 * (backend/src/config.ts → databaseUrl)، اما `prisma migrate deploy` مستقیم
 * env به نام DATABASE_URL را می‌خواند. اگر روی سرور فقط DB_* را ست کنی،
 * مهاجرت با «Environment variable not found: DATABASE_URL» شکست می‌خورد.
 *
 * منطق این فایل عیناً همان config.ts است — اگر آنجا تغییر کرد، اینجا هم عوض کن.
 *   node deploy/db-url.js > /tmp/u && psql "$u" -c 'select 1'
 */
const env = process.env;

// ترتیب همان config.ts است: DB_* بر DATABASE_URL اولویت دارد. اگر برعکس شود،
// مهاجرت ممکن است روی یک دیتابیس و API روی دیتابیس دیگری اجرا شود.
const fields = ['DB_HOST', 'DB_PORT', 'DB_USERNAME', 'DB_PASSWORD', 'DB_NAME'];
const hasDbFields = fields.some(key => env[key] !== undefined && env[key] !== '');

if (!hasDbFields && env.DATABASE_URL) {
  process.stdout.write(env.DATABASE_URL);
  process.exit(0);
}

const required = ['DB_HOST', 'DB_USERNAME', 'DB_PASSWORD', 'DB_NAME'];
const missing = required.filter(key => !env[key]);
if (missing.length) {
  console.error(`نه DB_* کامل است و نه DATABASE_URL ست شده؛ این‌ها خالی‌اند: ${missing.join(', ')}`);
  process.exit(1);
}

const url = new URL('postgresql://localhost');
url.hostname = env.DB_HOST;
url.port = String(env.DB_PORT || 5432);
url.username = env.DB_USERNAME;
url.password = env.DB_PASSWORD;
url.pathname = `/${encodeURIComponent(env.DB_NAME)}`;
url.searchParams.set('schema', 'public');
url.searchParams.set('sslmode', env.DB_SSL_MODE || 'disable');

process.stdout.write(url.toString());
