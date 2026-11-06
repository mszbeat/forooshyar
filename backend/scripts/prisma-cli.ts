import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import { databaseUrl } from '../src/config';
const url = databaseUrl(process.env);
if (!url) throw new Error('Set DB_HOST, DB_USERNAME, DB_PASSWORD and DB_NAME (or legacy DATABASE_URL)');
const bin = require.resolve('prisma/build/index.js');
const result = spawnSync(process.execPath, [bin, ...process.argv.slice(2)], { stdio: 'inherit', env: { ...process.env, DATABASE_URL: url } });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
