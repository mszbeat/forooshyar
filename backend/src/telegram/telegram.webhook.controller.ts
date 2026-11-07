import { Body, Controller, Headers, HttpCode, Param, Post } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { timingSafeEqual } from 'crypto';
import { TelegramService, type IncomingUpdate } from './telegram.service';

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * webhook تلگرام.
 *
 * امنیت در سه لایه:
 *  1. مسیر شامل یک سکرت است (`/telegram/webhook/<secret>`) — بدون آن هیچ‌کس
 *     نمی‌تواند آدرس را حدس بزند.
 *  2. هدر `X-Telegram-Bot-Api-Secret-Token` با همان سکرت مقایسه می‌شود
 *     (مقایسه‌ی زمان‌ثابت، تا از timing attack جلوگیری شود).
 *  3. خود update_id یکتا است؛ تکرار همان آپدیت دوباره پاسخ نمی‌گیرد.
 *
 * هیچ AuthGuardای اینجا نیست: تلگرام توکن ما را ندارد. `@SkipThrottle` هم لازم
 * است چون Throttler سراسری ۱۰۰ درخواست در دقیقه دارد و تلگرام از چند IP می‌فرستد.
 *
 * همیشه ۲۰۰ برمی‌گردانیم — حتی وقتی پردازش خطا بدهد — چون تلگرام در غیر این
 * صورت همان update را با تأخیر دوباره می‌فرستد و صف عقب می‌افتد.
 */
@Controller('telegram')
@SkipThrottle()
export class TelegramWebhookController {
  constructor(private readonly telegram: TelegramService) {}

  @Post('webhook/:secret')
  @HttpCode(200)
  async webhook(
    @Param('secret') secret: string,
    @Headers('x-telegram-bot-api-secret-token') header: string | undefined,
    @Body() update: IncomingUpdate,
  ) {
    const expected = (process.env.TELEGRAM_WEBHOOK_SECRET ?? '').trim();
    if (!expected || !safeEqual(secret, expected) || !header || !safeEqual(header, expected)) {
      // 401 عمداً بی‌جزئیات است؛ در لاگ هم چیزی از سکرت نمی‌نویسیم.
      return { ok: false, error: 'unauthorized' };
    }

    try {
      const result = await this.telegram.handleUpdate(update);
      return { ok: true, ...result };
    } catch (error) {
      // پاسخ ۲۰۰ می‌دهیم تا تلگرام دوباره نفرستد؛ خطا در لاگ سرور ثبت شده است.
      return { ok: false, error: error instanceof Error ? error.message : 'failed' };
    }
  }
}
