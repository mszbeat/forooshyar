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

    // Nest's own HttpExceptions already carry a client-ready body (a string, a
    // zod flatten, or a custom object). Pass it through untouched — replacing it
    // with a generic message hides which field was wrong, and the panel shows
    // `message` verbatim.
    let payload: Record<string, unknown>;
    if (isHttp) {
      const body = exception.getResponse();
      payload = typeof body === 'string' ? { message: body } : { ...(body as Record<string, unknown>) };
    } else {
      // Express/middleware errors (body-parser: 413, malformed JSON: 400) and any
      // unexpected crash. Messages are Persian because the panel renders them.
      payload = {
        message:
          status === 413 ? 'حجم درخواست بیش از حد مجاز است.'
          : status === 400 ? 'بدنه‌ی درخواست معتبر نیست.'
          : status === 429 ? 'تعداد درخواست‌ها زیاد بود؛ چند لحظه بعد دوباره تلاش کنید.'
          : 'خطای غیرمنتظره‌ای در سرور رخ داد.',
      };
    }

    if (status >= 500) {
      const stack = exception instanceof Error ? exception.stack : String(exception);
      this.logger.error(`${request.method} ${request.url} → ${status} [${context?.requestId ?? '-'}]\n${stack}`);
    }

    response.status(status).json({
      ...payload,
      statusCode: status,
      ...(context?.requestId ? { requestId: context.requestId } : {}),
      path: request.url,
    });
  }
}
