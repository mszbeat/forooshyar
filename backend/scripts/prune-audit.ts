/**
 * Deletes audit rows older than AUDIT_RETENTION_DAYS (default 90).
 * Run it from cron/systemd-timer, e.g. nightly:
 *   node -r ts-node/register scripts/prune-audit.ts
 */
import { PrismaClient } from '@prisma/client';
import { databaseUrl } from '../src/config';

async function main() {
  const days = Number(process.env.AUDIT_RETENTION_DAYS ?? 90);
  if (!Number.isFinite(days) || days < 1) throw new Error('AUDIT_RETENTION_DAYS must be a positive number');

  const db = new PrismaClient({ datasources: { db: { url: databaseUrl(process.env) } } });
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const { count } = await db.auditLog.deleteMany({ where: { createdAt: { lt: cutoff } } });
  console.log(`pruned ${count} audit rows older than ${cutoff.toISOString()} (${days} days)`);
  await db.$disconnect();
}

void main().catch(error => {
  console.error(error);
  process.exit(1);
});
