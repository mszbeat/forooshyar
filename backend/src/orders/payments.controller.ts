import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { PaymentsService } from '../payments/payments.service';

const toman = (value: number) => `${value.toLocaleString('fa-IR')} تومان`;

/**
 * صفحه‌ی نتیجه/درگاه.
 *
 * بدون فونت یا CSS بیرونی ساخته می‌شود: این صفحه در مرورگر مشتری و روی موبایل
 * باز می‌شود و اگر CDN بلاک باشد نباید خالی دیده شود. همه‌چیز inline و RTL است.
 */
function page(title: string, body: string, tone: 'ok' | 'fail' | 'neutral' = 'neutral'): string {
  const color = tone === 'ok' ? '#0f7b4f' : tone === 'fail' ? '#b42318' : '#1f2937';
  const bg = tone === 'ok' ? '#ecfdf3' : tone === 'fail' ? '#fef3f2' : '#f6f7f9';
  return `<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
</head>
<body style="margin:0;background:#f0f1f4;font-family:Vazirmatn,'Segoe UI',Tahoma,sans-serif;color:#111827">
  <main style="max-width:520px;margin:6vh auto;background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:26px 22px;box-shadow:0 1px 2px rgba(16,24,40,.06)">
    <div style="background:${bg};color:${color};border-radius:10px;padding:14px 16px;font-weight:700;font-size:17px;margin-bottom:18px">${title}</div>
    ${body}
    <p style="margin:22px 0 0;font-size:12px;color:#6b7280;line-height:1.9">فروشیار — این صفحه را می‌توانید ببندید و به تلگرام برگردید.</p>
  </main>
</body>
</html>`;
}

function orderBox(order: { code: string; total: number; items: { title: string; spec: string; quantity: number; price: number }[] }): string {
  const rows = order.items.map(item => `
    <tr>
      <td style="padding:8px 0;border-bottom:1px solid #f1f2f4">${item.title}${item.spec ? `<span style="color:#6b7280"> (${item.spec})</span>` : ''}</td>
      <td style="padding:8px 0;border-bottom:1px solid #f1f2f4;text-align:left;white-space:nowrap">${item.quantity.toLocaleString('fa-IR')} × ${toman(item.price)}</td>
    </tr>`).join('');
  return `
  <table style="width:100%;border-collapse:collapse;font-size:14px">
    <thead><tr><th style="text-align:right;padding:6px 0;color:#6b7280;font-weight:500">اقلام سفارش ${order.code}</th><th></th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div style="display:flex;justify-content:space-between;margin-top:14px;font-weight:700;font-size:15px">
    <span>مبلغ قابل پرداخت</span><span>${toman(order.total)}</span>
  </div>`;
}

@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  /**
   * درگاه آزمایشی. عمداً عمومی است (مشتری لاگین ندارد) و مثل درگاه واقعی با
   * لینک کار می‌کند؛ فقط پول جابه‌جا نمی‌شود.
   */
  @Get('sandbox/:authority')
  @SkipThrottle()
  async sandbox(
    @Param('authority') authority: string,
    @Query('result') result: string | undefined,
    @Res() res: Response,
  ) {
    /* global Response */
    if (result === 'ok' || result === 'fail') {
      const outcome = await this.payments.confirmSandbox(authority, result === 'ok');
      if (outcome.ok) {
        res.type('html').send(page('پرداخت تأیید شد ✅', `
          ${outcome.already ? '<p style="margin:0 0 12px;color:#6b7280">این سفارش قبلاً پرداخت شده بود؛ دوباره ثبت نشد.</p>' : ''}
          ${orderBox(outcome.order as never)}
          <p style="margin:16px 0 0;line-height:1.9">سفارش شما ثبت شد و به فروشنده اطلاع دادیم. کد پیگیری: <b>${outcome.order.code}</b></p>
        `, 'ok'));
        return;
      }
      res.status(outcome.reason === 'order_not_found' ? 404 : 400).type('html').send(page('پرداخت انجام نشد', `
        <p style="margin:0;line-height:1.9">${outcome.reason === 'cancelled_by_user'
          ? 'پرداخت لغو شد. سفارش شما تا ۲۴ ساعت محفوظ می‌ماند؛ اگر پرداخت نکنید موجودی آزاد می‌شود.'
          : outcome.reason === 'cancelled'
            ? 'این سفارش قبلاً لغو شده است. اگر مبلغی کسر شده، فروشنده مرجوع می‌کند.'
            : 'سفارش پیدا نشد. لینک پرداخت را از تلگرام دوباره بگیرید.'}</p>
      `, 'fail'));
      return;
    }

    const order = await this.payments.orderByAuthority(authority);
    if (!order) {
      res.status(404).type('html').send(page('لینک معتبر نیست', '<p style="margin:0">این لینک پرداخت پیدا نشد یا منقضی شده است.</p>', 'fail'));
      return;
    }
    if (order.status !== 'AWAITING_PAYMENT') {
      res.type('html').send(page('این سفارش قبلاً پرداخت شده', orderBox(order as never), 'ok'));
      return;
    }

    res.type('html').send(page('پرداخت سفارش', `
      <p style="margin:0 0 16px;color:#b42318;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:10px 12px;font-size:13px;line-height:1.9">
        درگاه آزمایشی: هیچ پولی جابه‌جا نمی‌شود. این صفحه فقط برای تست جریان سفارش است.
      </p>
      ${orderBox(order as never)}
      <div style="display:flex;gap:10px;margin-top:20px">
        <a href="/payments/sandbox/${encodeURIComponent(authority)}?result=ok"
           style="flex:1;text-align:center;text-decoration:none;background:#111827;color:#fff;padding:12px 14px;border-radius:9px;font-weight:700">پرداخت موفق</a>
        <a href="/payments/sandbox/${encodeURIComponent(authority)}?result=fail"
           style="flex:1;text-align:center;text-decoration:none;background:#fff;color:#b42318;border:1px solid #fecdca;padding:12px 14px;border-radius:9px;font-weight:700">انصراف</a>
      </div>
    `));
  }

  /** بازگشت از زرین‌پال: پرداخت فقط بعد از verify قطعی می‌شود. */
  @Get('zarinpal/callback')
  @SkipThrottle()
  async zarinpal(@Query('Authority') authority: string, @Query('Status') status: string, @Res() res: Response) {
    const outcome = await this.payments.verifyZarinpal(authority ?? '', status ?? '');
    if (outcome.ok) {
      res.type('html').send(page('پرداخت تأیید شد ✅', `
        ${outcome.already ? '<p style="margin:0 0 12px;color:#6b7280">این سفارش قبلاً ثبت شده بود.</p>' : ''}
        ${orderBox(outcome.order as never)}
        <p style="margin:16px 0 0;line-height:1.9">کد پیگیری: <b>${outcome.order.code}</b></p>
      `, 'ok'));
      return;
    }
    res.status(outcome.reason === 'order_not_found' ? 404 : 400).type('html').send(page('پرداخت انجام نشد', `
      <p style="margin:0;line-height:1.9">${outcome.reason === 'cancelled_by_user'
        ? 'پرداخت لغو شد یا ناموفق بود.'
        : 'تأیید پرداخت ناموفق بود. اگر مبلغی کسر شده، با فروشنده تماس بگیرید.'}</p>
    `, 'fail'));
  }
}
