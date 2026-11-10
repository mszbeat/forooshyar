import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { currentContext, redact } from './request-context';

export type AuditEvent = {
  action: string;
  entity?: string;
  entityId?: string;
  meta?: Record<string, unknown>;
  /** Overrides the ambient request context when a service logs for another actor. */
  shopId?: string;
  userId?: string;
};

export const AUDIT_LOG_READS = 'AUDIT_LOG_READS';

export type AuditEntry = {
  requestId: string;
  action: string;
  method: string;
  path: string;
  statusCode: number;
  success: boolean;
  durationMs: number;
  shopId?: string | null;
  userId?: string | null;
  entity?: string | null;
  entityId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  meta?: Record<string, unknown> | null;
};

/**
 * Writes the audit trail. Two sinks:
 *   1. one structured JSON line on stdout (always, cheap, greppable)
 *   2. one row in `AuditLog` (mutations and failures; reads only when enabled)
 *
 * Logging must never break a request: every failure below is swallowed and
 * reported once through the Nest logger.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger('Audit');
  private writeFailures = 0;

  private readonly bootLogReads: boolean;

  constructor(
    private readonly db: PrismaService,
    @Optional() @Inject(AUDIT_LOG_READS) logReads?: boolean,
  ) {
    this.bootLogReads = logReads ?? process.env.AUDIT_LOG_READS === 'true';
  }

  /**
   * مقدار از env در هر نوشتن خوانده می‌شود تا تغییرش در پنل ادمین بدون
   * ری‌استارت سرویس اثر کند.
   */
  private get logReads(): boolean {
    const flag = (process.env.AUDIT_LOG_READS ?? '').trim();
    if (flag === 'true' || flag === 'false') return flag === 'true';
    return this.bootLogReads;
  }

  /** Domain-level event from inside a service (has request context automatically). */
  record(event: AuditEvent): void {
    const context = currentContext();
    this.write({
      requestId: context?.requestId ?? 'sys',
      action: event.action,
      // Service-level events are not HTTP calls; the matching request row
      // (same requestId) carries the real method, path and status.
      method: 'EVENT',
      path: '-',
      statusCode: 200,
      success: true,
      durationMs: 0,
      shopId: event.shopId ?? context?.shopId ?? null,
      userId: event.userId ?? context?.userId ?? null,
      entity: event.entity ?? null,
      entityId: event.entityId ?? null,
      ip: context?.ip ?? null,
      userAgent: context?.userAgent ?? null,
      meta: event.meta ?? null,
    });
  }

  /** One entry per HTTP request, called by LoggingInterceptor. */
  write(entry: AuditEntry): void {
    this.emit(entry);
    const payload: Prisma.AuditLogUncheckedCreateInput = {
      requestId: entry.requestId,
      action: entry.action,
      method: entry.method,
      path: entry.path,
      statusCode: entry.statusCode,
      success: entry.success,
      durationMs: entry.durationMs,
      shopId: entry.shopId ?? null,
      userId: entry.userId ?? null,
      entity: entry.entity ?? null,
      entityId: entry.entityId ?? null,
      ip: entry.ip ?? null,
      userAgent: entry.userAgent ?? null,
      errorCode: entry.errorCode ?? null,
      errorMessage: entry.errorMessage ?? null,
      meta: entry.meta === null || entry.meta === undefined
        ? Prisma.JsonNull
        : (redact(entry.meta) as Prisma.InputJsonValue),
    };

    const shouldPersist = entry.success ? (this.logReads || entry.method !== 'GET') : true;
    if (!shouldPersist) return;

    // Fire and forget: the response must not wait on the audit insert.
    void this.db.auditLog.create({ data: payload }).catch(error => {
      this.writeFailures += 1;
      // Log the first few failures loudly, then only every 50th, to avoid log floods.
      if (this.writeFailures <= 3 || this.writeFailures % 50 === 0) {
        this.logger.error(`audit write failed (${this.writeFailures}x): ${(error as Error).message}`);
      }
    });
  }

  private emit(entry: AuditEntry): void {
    const line = {
      ts: new Date().toISOString(),
      level: entry.success ? 'info' : 'error',
      kind: 'audit',
      requestId: entry.requestId,
      action: entry.action,
      method: entry.method,
      path: entry.path,
      status: entry.statusCode,
      durationMs: entry.durationMs,
      shopId: entry.shopId ?? undefined,
      userId: entry.userId ?? undefined,
      entity: entry.entity ?? undefined,
      entityId: entry.entityId ?? undefined,
      ip: entry.ip ?? undefined,
      errorCode: entry.errorCode ?? undefined,
      errorMessage: entry.errorMessage ?? undefined,
      meta: entry.meta ?? undefined,
    };
    const text = JSON.stringify(line);
    if (entry.success) this.logger.log(text);
    else this.logger.warn(text);
  }
}
