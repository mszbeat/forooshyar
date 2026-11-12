import { z } from 'zod';

const schema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  DATABASE_URL: z.string().url().refine((value) => value.startsWith('postgresql://') || value.startsWith('postgres://'), 'PostgreSQL URL required'),
  CACHE_ENABLED: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  REDIS_URL: z.string().optional(),
  CORS_ORIGINS: z.string().default(''),
  JWT_SECRET: z.string().min(32),
}).superRefine((config, context) => {
  const origins = config.CORS_ORIGINS.split(',').map(value => value.trim()).filter(Boolean);
  for (const origin of origins) {
    try {
      const url = new URL(origin);
      if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin || url.username || url.password) throw new Error('invalid origin');
    } catch {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['CORS_ORIGINS'], message: 'Use comma-separated HTTP(S) origins without paths or trailing slash' });
      break;
    }
  }
  if (config.CACHE_ENABLED && (!config.REDIS_URL || !/^rediss?:\/\//.test(config.REDIS_URL) || !z.string().url().safeParse(config.REDIS_URL).success)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['REDIS_URL'], message: 'A valid redis:// or rediss:// URL is required when cache is enabled' });
  }
});
export type AppConfig = z.infer<typeof schema>;
export function databaseUrl(env: NodeJS.ProcessEnv): string {
  const fields = ['DB_HOST', 'DB_PORT', 'DB_USERNAME', 'DB_PASSWORD', 'DB_NAME'] as const;
  if (fields.some(key => env[key] !== undefined && env[key] !== '')) {
    const parsed = z.object({
      DB_HOST: z.string().min(1), DB_PORT: z.coerce.number().int().min(1).max(65535).default(5432),
      DB_USERNAME: z.string().min(1), DB_PASSWORD: z.string().min(1), DB_NAME: z.string().min(1),
      DB_SSL_MODE: z.enum(['disable', 'require', 'verify-full']).default('disable'),
    }).parse(env);
    const url = new URL('postgresql://localhost');
    url.hostname = parsed.DB_HOST;
    if (url.hostname !== parsed.DB_HOST) throw new Error('Invalid DB_HOST');
    url.port = String(parsed.DB_PORT);
    url.username = parsed.DB_USERNAME;
    url.password = parsed.DB_PASSWORD;
    url.pathname = `/${encodeURIComponent(parsed.DB_NAME)}`;
    url.searchParams.set('schema', 'public');
    url.searchParams.set('sslmode', parsed.DB_SSL_MODE);
    return url.toString();
  }
  return env.DATABASE_URL ?? '';
}
export const loadConfig = (env: NodeJS.ProcessEnv): AppConfig => schema.parse({ ...env, DATABASE_URL: databaseUrl(env) });

/**
 * حالت pooler اتصال دیتابیس را از روی URL تشخیص می‌دهد و بدون افشای هیچ
 * رازی (رمز/هاست کامل) فقط حالت و سقف اتصال را برمی‌گرداند تا در لاگ
 * استارتاپ ثبت شود. هدف: اگر کسی اشتباهی به pooler session-mode با
 * connection_limit بالا وصل شد، همان اول دیده شود.
 */
export type PoolerMode = 'transaction' | 'session' | 'direct' | 'unknown';

export function describePooler(url: string): { mode: PoolerMode; connectionLimit: number | null; pgbouncer: boolean } {
  try {
    const parsed = new URL(url);
    const port = parsed.port || '5432';
    const pgbouncer = parsed.searchParams.get('pgbouncer') === 'true';
    const limitParam = parsed.searchParams.get('connection_limit');
    const connectionLimit = limitParam ? Number.parseInt(limitParam, 10) : null;
    let mode: PoolerMode = 'unknown';
    if (port === '6543' || pgbouncer) mode = 'transaction';
    else if (port === '5432' && parsed.hostname.includes('pooler')) mode = 'session';
    else if (port === '5432') mode = 'direct';
    return { mode, connectionLimit: Number.isFinite(connectionLimit) ? connectionLimit : null, pgbouncer };
  } catch {
    return { mode: 'unknown', connectionLimit: null, pgbouncer: false };
  }
}

/**
 * بررسی استارتاپ اتصال دیتابیس: حالت pooler را لاگ می‌زند و اگر حالت
 * session با connection_limit بالا باشد هشدار می‌دهد (چون pooler
 * session-mode سقف کمی دارد و چند نمونه‌ی سرویس آن را تمام می‌کنند).
 */
export function warnOnRiskyPooler(url: string, logger: { warn: (msg: string) => void; log: (msg: string) => void }): void {
  const { mode, connectionLimit, pgbouncer } = describePooler(url);
  logger.log(`database pooler mode: ${mode}${connectionLimit !== null ? ` (connection_limit=${connectionLimit})` : ''}${pgbouncer ? ' [pgbouncer=true]' : ''}`);
  if (mode === 'session' && (connectionLimit === null || connectionLimit > 10)) {
    logger.warn('اتصال دیتابیس روی pooler session-mode با connection_limit بالا است؛ برای runtime از pooler تراکنشی (پورت 6543 با ?pgbouncer=true&connection_limit=5) استفاده کنید.');
  }
  if (mode === 'transaction' && !pgbouncer) {
    logger.warn('پورت 6543 بدون ?pgbouncer=true استفاده شده است؛ Prisma باید بداند اتصال تراکنشی است.');
  }
}

/**
 * پلتفرم‌هایی که ترافیک را از بیرون کانتینر به پورت پروسه می‌رسانند، پس باید روی
 * همه‌ی اینترفیس‌ها گوش داد. بدون این، پیش‌فرض loopback باعث می‌شود پلتفرم پورت
 * را نبیند و دیپلوی با «No open ports detected on 0.0.0.0 … Detected open ports on
 * localhost» شکست بخورد. تا وقتی HOST ست نشده باشد از این علامت‌ها استفاده می‌کنیم.
 */
const PLATFORM_MARKERS = ['RENDER', 'RAILWAY_ENVIRONMENT', 'FLY_APP_NAME', 'DYNO', 'K_SERVICE', 'WEBSITE_SITE_NAME'];

/**
 * آدرس bind.
 *  1. HOST اگر ست شده باشد (همیشه اولویت دارد).
 *  2. روی PaaS معروف: 0.0.0.0 تا از بیرون دیده شود.
 *  3. در غیر این صورت loopback — امن‌ترین پیش‌فرض برای VPS پشت Nginx.
 */
export function resolveHost(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.HOST?.trim();
  if (explicit) return explicit;
  return PLATFORM_MARKERS.some(key => env[key]) ? '0.0.0.0' : '127.0.0.1';
}
