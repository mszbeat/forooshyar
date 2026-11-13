import { Controller, Get, Headers, HttpCode, Logger, Post, Query, Req, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Response } from 'express';
import { InstagramService } from './instagram.service';
import { readInstagramConfig } from './instagram.config';

/** بدنه‌ی خام: توسط `jsonBodyParser` روی درخواست گذاشته می‌شود. */
type RawRequest = { rawBody?: Buffer; body?: unknown };

/**
 * webhook متا (API رسمی اینستاگرام).
 *
 * امنیت در سه لایه:
 *  ۱. handshake اولیه با `hub.verify_token` هنگام ثبت در داشبورد متا.
 *  ۲. امضای `X-Hub-Signature-256` (HMAC-SHA256 روی بدنه‌ی خام با سکرت اپ).
 *  ۳. dedupe با mid/comment_id روی جدول InstagramEvent (داخل سرویس).
 *
 * همیشه ۲۰۰ برمی‌گردانیم تا متا رویداد را دوباره نفرستد؛ پردازش پس از تأیید
 * امضا بدون انتظار اجرا می‌شود.
 */
@Controller('webhooks')
@SkipThrottle()
export class MetaWebhookController {
  private readonly logger = new Logger('MetaWebhook');

  constructor(private readonly instagram: InstagramService) {}

  /** تأیید آدرس هنگام ثبت webhook در داشبورد متا. */
  @Get('instagram-meta')
  verify(
    @Query('hub.mode') mode?: string,
    @Query('hub.verify_token') token?: string,
    @Query('hub.challenge') challenge?: string,
  ) {
    const config = readInstagramConfig();
    if (mode === 'subscribe' && token && config.metaVerifyToken && token === config.metaVerifyToken) {
      return challenge ?? '';
    }
    return { ok: false };
  }

  @Post('instagram-meta')
  @HttpCode(200)
  async webhook(
    @Req() req: RawRequest,
    @Headers('x-hub-signature-256') signature?: string,
  ) {
    const config = readInstagramConfig();
    const raw = req.rawBody ?? (req.body ? Buffer.from(JSON.stringify(req.body), 'utf8') : Buffer.alloc(0));

    if (config.metaAppSecret) {
      const expected = `sha256=${createHmac('sha256', config.metaAppSecret).update(raw).digest('hex')}`;
      const a = Buffer.from(signature ?? '');
      const b = Buffer.from(expected);
      if (a.length !== b.length || !timingSafeEqual(a, b)) {
        this.logger.warn('webhook متا رد شد (امضا نامعتبر)');
        return { ok: false };
      }
    } else {
      this.logger.warn('META_APP_SECRET ست نشده؛ امضای webhook متا بررسی نشد.');
    }

    void this.instagram.handleMetaWebhook(req.body ?? {})
      .catch(error => {
        this.logger.error(`پردازش webhook متا ناموفق: ${error instanceof Error ? error.message : 'unknown'}`);
      });
    return { ok: true };
  }
}

/**
 * callback گفتگوی OAuth متا.
 *
 * مرورگر فروشنده پس از اجازه در متا به این آدرس برمی‌گردد (بدون احراز هویت —
 * هویت از `state` امضاشده می‌آید). پس از اتصال، به پنل redirect می‌کنیم.
 */
@Controller('instagram/meta')
@SkipThrottle()
export class MetaOAuthController {
  private readonly logger = new Logger('MetaOAuth');

  constructor(private readonly instagram: InstagramService) {}

  @Get('callback')
  async callback(
    @Res() res: Response,
    @Query('code') code?: string,
    @Query('state') state?: string,
  ) {
    const base = (process.env.FRONTEND_URL ?? '').replace(/\/+$/, '');
    const done = (result: string) => res.redirect(`${base}/app/accounts?instagram=${result}`);
    if (!code || !state) return done('error');
    try {
      const result = await this.instagram.completeMetaConnect(code, state);
      return done(result.ok ? 'connected' : 'error');
    } catch (error) {
      this.logger.error(`اتصال Meta ناموفق: ${error instanceof Error ? error.message : 'unknown'}`);
      return done('error');
    }
  }
}
