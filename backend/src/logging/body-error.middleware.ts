import { json } from 'express';
import type { NextFunction, Request, Response } from 'express';
import { currentContext } from './request-context';

type BodyParserError = Error & { type?: string; status?: number; statusCode?: number };

/** بدنه‌ی خام فقط برای مسیرهایی که امضای HMAC دارند نگه داشته می‌شود. */
type WithRawBody = { rawBody?: Buffer; originalUrl?: string; url?: string };

/**
 * نگه‌داشتن بدنه‌ی خام برای بررسی امضای webhook.
 *
 * چرا لازم است: امضای BoxAPI روی **بایت‌های اصلی** بدنه حساب می‌شود. اگر بعداً
 * `JSON.stringify(req.body)` را امضا کنیم، ترتیب کلیدها و فاصله‌ها عوض می‌شود و
 * امضا هرگز نمی‌خواند. فقط مسیر webhook این بافر را نگه می‌دارد تا حافظه‌ی
 * بقیه‌ی درخواست‌ها بی‌دلیل اشغال نشود.
 */
const RAW_BODY_PATHS = ['/webhooks/instagram'];
function keepRawBody(req: { originalUrl?: string; url?: string }): boolean {
  const path = req.originalUrl ?? req.url ?? '';
  return RAW_BODY_PATHS.some(prefix => path.startsWith(prefix));
}

const parseJson = json({
  limit: '64kb',
  verify: (req, _res, buffer) => {
    if (keepRawBody(req as WithRawBody)) (req as WithRawBody).rawBody = Buffer.from(buffer);
  },
});

/**
 * body-parser خطاهایش را به‌صورت Error با `status` و پیام انگلیسی فنی پرتاب
 * می‌کند («Expected property name or '}' in JSON at position 1»). Nest بعداً آن
 * را به HttpException تبدیل می‌کند و در exception filter دیگر قابل تشخیص نیست؛
 * نتیجه این بود که کاربر پنل پیام انگلیسی می‌دید.
 *
 * اینجا همان لحظه به پاسخ فارسی تبدیلش می‌کنیم.
 *
 * نکته: این تابع عمداً سه‌آرگومانی است. Nest میان‌افزارها را با (req, res, next)
 * صدا می‌زند و یک error-handler چهارآرگومانی را درست وصل نمی‌کند — با تابع
 * چهارآرگومانی خطای `next is not a function` و ۵۰۰ روی *همه‌ی* مسیرها گرفتیم.
 */
export function jsonBodyParser(req: Request, res: Response, next: NextFunction): void {
  parseJson(req, res, (error?: BodyParserError) => {
    if (!error) return next();

    const status = error.status ?? error.statusCode;
    const isJsonError = error.type === 'entity.parse.failed' || (status === 400 && !error.type);
    const tooLarge = error.type === 'entity.too.large' || status === 413;

    if (!isJsonError && !tooLarge) return next(error);
    if (res.headersSent) return next(error);

    const requestId = currentContext()?.requestId;
    res.status(tooLarge ? 413 : 400).json({
      statusCode: tooLarge ? 413 : 400,
      // همان requestId در لاگ audit هم هست؛ پشتیبانی با آن رویداد را پیدا می‌کند.
      ...(requestId ? { requestId } : {}),
      path: req.originalUrl.split('?')[0],
      message: tooLarge
        ? 'حجم درخواست بیش از حد مجاز است.'
        : 'بدنه‌ی درخواست معتبر نیست؛ قالب JSON را بررسی کنید.',
    });
  });
}
