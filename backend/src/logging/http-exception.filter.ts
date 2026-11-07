import { ArgumentsHost, Catch, HttpException, Logger } from '@nestjs/common';
import type { BaseExceptionFilter } from '@nestjs/core';
import type { Request, Response } from 'express';
import { currentContext } from './request-context';

/**
 * Last line of defence: unhandled errors still produce a log line with a stack,
 * and the client gets the request id back so support can find the event.
 */
@Catch()
export class AllExceptionsFilter {
  private readonly logger = new Logger('HTTP');

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<Request>();
    const context = currentContext();

    const isHttp = exception instanceof HttpException;
    // Body-parser and other Express middleware throw plain errors that carry a
    // `status`/`statusCode` (413 too large, 400 malformed JSON, 415 wrong type).
    const rawStatus = isHttp
      ? exception.getStatus()
      : Number((exception as { status?: unknown; statusCode?: unknown })?.status
        ?? (exception as { statusCode?: unknown })?.statusCode);
    const status = Number.isInteger(rawStatus) && rawStatus >= 400 && rawStatus <= 599 ? rawStatus : 500;

    const body = isHttp ? exception.getResponse() : null;
    const message = typeof body === 'string'
      ? body
      : (body as { message?: unknown } | null)?.message
        ?? (status === 413 ? 'Payload too large' : status === 400 ? 'Malformed request body' : 'Internal server error');

    if (status >= 500) {
      const stack = exception instanceof Error ? exception.stack : String(exception);
      this.logger.error(`${request.method} ${request.url} → ${status} [${context?.requestId ?? '-'}]\n${stack}`);
    }

    response.status(status).json({
      statusCode: status,
      message,
      ...(context?.requestId ? { requestId: context.requestId } : {}),
      path: request.url,
    });
  }
}
