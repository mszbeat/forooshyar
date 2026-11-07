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
    const status = isHttp ? exception.getStatus() : 500;
    const body = isHttp ? exception.getResponse() : null;
    const message = typeof body === 'string'
      ? body
      : (body as { message?: unknown } | null)?.message ?? 'Internal server error';

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
