import { z } from 'zod';

const schema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  DATABASE_URL: z.string().url().refine((value) => value.startsWith('postgresql://') || value.startsWith('postgres://'), 'PostgreSQL URL required'),
  REDIS_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
});
export const loadConfig = (env: NodeJS.ProcessEnv) => schema.parse(env);
