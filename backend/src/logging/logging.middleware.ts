import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { actionFor, entityIdFrom } from './actions';
import { AuditService } from './audit.service';
import { newRequestId, runWithContext, type RequestContext } from './request-context';

/**
 * Owns the request-level audit row.
 *
 * It lives in middleware (not an interceptor) on purpose: guards and the 404
 * handler run before interceptors, so an interceptor would silently miss
 * rejected tokens and unknown routes — exactly the events you want a trail for.
 *
 * Also opens the log context used by `AuditService.record()` in services and
 * echoes the id back in `x-request-id` so a user-facing error can be traced.
 */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(private readonly audit: AuditService) {}

  use(request: Request, response: Response, next: NextFunction): void {
    const incoming = request.headers['x-request-id'];
    const requestId = typeof incoming === 'string' && /^[A-Za-z0-9_-]{6,64}$/.test(incoming)
      ? incoming
      : newRequestId();

    response.setHeader('x-request-id', requestId);

    const forwarded = request.headers['x-forwarded-for'];
    const ip = (typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : undefined)
      ?? request.ip
      ?? request.socket?.remoteAddress;

    // `request.path` is relative to the mount point *inside* the finish callback,
    // so the route is resolved from originalUrl up front and kept.
    const routePath = (request.originalUrl ?? request.url).split('?')[0];

    const context: RequestContext = {
      requestId,
      method: request.method,
      path: routePath,
      ip,
      userAgent: request.headers['user-agent']?.slice(0, 300),
    };

    const startedAt = process.hrtime.bigint();
    const { action, entity } = actionFor(request.method, routePath);

    // 'finish' fires for every outcome, including aborted-to-error responses.
    response.on('finish', () => {
      const durationMs = Math.round(Number(process.hrtime.bigint() - startedAt) / 1e6);
      const status = response.statusCode || 500;
      this.audit.write({
        requestId,
        action,
        method: request.method,
        path: routePath,
        statusCode: status,
        success: status < 400,
        durationMs,
        // filled in by the auth guard when the token was accepted
        shopId: context.shopId ?? null,
        userId: context.userId ?? null,
        entity: entity ?? null,
        entityId: entityIdFrom(routePath) ?? null,
        ip,
        userAgent: context.userAgent ?? null,
        errorCode: status < 400 ? null : status === 401 ? 'Unauthorized' : status === 404 ? 'NotFound' : status === 429 ? 'TooManyRequests' : 'RequestFailed',
        errorMessage: status < 400 ? null : `request failed with ${status}`,
      });
    });

    runWithContext(context, () => next());
  }
}
