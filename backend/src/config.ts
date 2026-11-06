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
