import { z } from 'zod';

const schema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  DATABASE_URL: z.string().url().refine((value) => value.startsWith('postgresql://') || value.startsWith('postgres://'), 'PostgreSQL URL required'),
  CACHE_ENABLED: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  REDIS_URL: z.string().optional(),
  JWT_SECRET: z.string().min(32),
}).superRefine((config, context) => {
  if (config.CACHE_ENABLED && (!config.REDIS_URL || !/^rediss?:\/\//.test(config.REDIS_URL) || !z.string().url().safeParse(config.REDIS_URL).success)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['REDIS_URL'], message: 'A valid redis:// or rediss:// URL is required when cache is enabled' });
  }
});
export type AppConfig = z.infer<typeof schema>;
export const loadConfig = (env: NodeJS.ProcessEnv): AppConfig => schema.parse(env);
