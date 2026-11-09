import { Controller, Get, Headers, HttpCode, Logger, Post, Query, Req } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { InstagramService, type InstagramWebhook } from './instagram.service';
import { readInstagramConfig } from './instagram.config';
import { verifySignature } from './signature';

/** بدنه‌ی خام: توسط `jsonBodyParser` روی درخواست گذاشته می‌شود. */
type RawRequest = { rawBody?: Buffer; body?: unknown };

/**
 * webhook اینستاگرام (BoxAPI).
 *
 * امنیت در چهار لایه:
 *  1. مسیر ثابت است (`/webhooks/instagram`) چون BoxAPI آدرس را از داشبورد
 *     می‌گیرد و سکرت در مسیر نمی‌گذارد؛ امنیت واقعی از امضاست.
 *  2. امضای HMAC روی **بدنه‌ی خام** و مهر زمانی ±۳۰۰ ثانیه
 *     (`X-BoxApi-Signature`/`X-BoxApi-Timestamp`).
 *  3. `event_id` یکتاست؛ تکرار همان رویداد دوباره پردازش نمی‌شود.
 *  4. هیچ AuthGuard‌ای نیست (BoxAPI توکن ما را ندارد) و `@SkipThrottle` لازم
 *     است چون Throttler سراسری ۱۰۰ درخواست در دقیقه دارد.
 *
 * همیشه ۲۰۰ برمی‌گردانیم — حتی وقتی پردازش شکست بخورد — چون BoxAPI در غیر این
 * صورت تا ۳ بار همان رویداد را دوباره می‌فرستد و صف عقب می‌افتد. پاسخ سریع هم
 * شرط مستندات است؛ به همین دلیل پردازش پس از تأیید امضا **بدون انتظار** اجرا
 * می‌شود و نتیجه‌اش فقط در لاگ/audit می‌نشیند.
 */
@Controller('webhooks')
@SkipThrottle()
export class InstagramWebhookController {
  private readonly logger = new Logger('InstagramWebhook');

  constructor(private readonly instagram: InstagramService) {}

  /**
   * تأیید آدرس هنگام ثبت webhook در داشبورد.
   *
   * داشبورد BoxAPI ممکن است آدرس را با یک GET ساده تست کند؛ پاسخ ۲۰۰ کافی است
   * و اگر پارامتر `challenge` فرستاده شود همان را برمی‌گردانیم تا هر دو سبک
   * تأیید کار کنند.
   */
  @Get('instagram')
  verify(@Query('challenge') challenge?: string) {
    return challenge ? { challenge } : { ok: true, service: 'forooshyar-instagram-webhook' };
  }

  @Post('instagram')
  @HttpCode(200)
  async webhook(
    @Req() req: RawRequest,
    @Headers('x-boxapi-signature') signature?: string,
    @Headers('x-boxapi-timestamp') timestamp?: string,
    @Headers('x-boxapi-event-id') headerEventId?: string,
  ) {
    const config = readInstagramConfig();
    const raw = req.rawBody ?? (req.body ? Buffer.from(JSON.stringify(req.body), 'utf8') : Buffer.alloc(0));

    const check = verifySignature({
      rawBody: raw,
      signature,
      timestamp,
      secret: config.webhookSecret,
    });
    if (!check.ok) {
      // پیام خطا عمداً کلی است: مهاجم نباید بفهمد کدام شرط رد شده.
      this.logger.warn(`webhook اینستاگرام رد شد (${check.reason})`);
      return { ok: false, error: 'unauthorized' };
    }
    if (!check.enforced) {
      // هشدار یک‌باره در هر درخواست؛ اگر سکرت ست نشده باشد باید در لاگ دیده شود.
      this.logger.warn('INSTAGRAM_WEBHOOK_SECRET ست نشده؛ امضای webhook بررسی نشد.');
    }

    const payload = (req.body ?? {}) as InstagramWebhook;
    if (headerEventId && !payload.event_id) payload.event_id = headerEventId;

    // پردازش در پس‌زمینه؛ خطا هرگز باعث ۵۰۰ نمی‌شود.
    void this.instagram.handleWebhook(payload)
      .then(result => {
        if (result.status === 'ignored' && result.reason !== 'unsupported_event') {
          this.logger.debug?.(`رویداد نادیده گرفته شد: ${result.reason}`);
        }
      })
      .catch(error => {
        this.logger.error(`پردازش webhook اینستاگرام ناموفق: ${error instanceof Error ? error.message : 'unknown'}`);
      });

    return { ok: true };
  }
}
