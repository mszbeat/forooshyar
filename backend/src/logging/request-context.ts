import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Everything we know about the request that is currently being handled.
 * Populated by RequestContextMiddleware, filled in progressively by the
 * auth guard (userId/shopId) and read by AuditService.
 */
export type RequestContext = {
  requestId: string;
  method: string;
  path: string;
  ip?: string;
  userAgent?: string;
  userId?: string;
  shopId?: string;
};

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithContext<T>(context: RequestContext, callback: () => T): T {
  return storage.run(context, callback);
}

export function currentContext(): RequestContext | undefined {
  return storage.getStore();
}

/** Called by AuthGuard once the token is verified. */
export function bindPrincipal(principal: { userId: string; shopId: string }): void {
  const context = storage.getStore();
  if (!context) return;
  context.userId = principal.userId;
  context.shopId = principal.shopId;
}

let sequence = 0;

/** Short, sortable-ish, collision-free enough for one process. */
export function newRequestId(): string {
  sequence = (sequence + 1) % 1_000_000;
  const time = Date.now().toString(36);
  const counter = sequence.toString(36).padStart(4, '0');
  const random = Math.random().toString(36).slice(2, 6);
  return `req_${time}${counter}${random}`;
}

const REDACTED = '[redacted]';
const SENSITIVE = /^(password|passwordhash|token|accesstoken|authorization|secret|apikey|api_key|cookie)$/i;

/**
 * Deep-copies a value for logging, dropping secrets and truncating long text.
 * Never throws: a malformed object must not take a request down.
 */
export function redact(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (depth > 4) return '[depth]';
  if (typeof value === 'string') return value.length > 500 ? `${value.slice(0, 500)}…` : value;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.slice(0, 50).map(entry => redact(entry, depth + 1));
  if (typeof value === 'object') {
    const output: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      output[key] = SENSITIVE.test(key) ? REDACTED : redact(entry, depth + 1);
    }
    return output;
  }
  return String(value);
}
