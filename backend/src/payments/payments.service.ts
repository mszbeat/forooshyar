import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { OrdersService } from '../orders/orders.service';

/**
 * درگاه پرداخت.
 *
 * دو حالت دارد و انتخاب خودکار است:
 *  ۱. `ZARINPAL_MERCHANT_ID` ست شده → درگاه واقعی زرین‌پال (v4).
 *  ۲. ست نشده → درگاه **آزمایشی داخلی**: یک صفحه‌ی ساده روی همین سرویس که
 *     «پرداخت موفق / انصراف» دارد. دلیل وجودش همان دلیلی است که بات را بدون
 *     توکن هم قابل تست کردیم: کل جریان سفارش → پرداخت → اعلان فروشنده باید
 *     امروز کار کند، نه بعد از گرفتن مرچنت‌آیدی.
 *
 * ⚠️ حالت آزمایشی هیچ پولی جابه‌جا نمی‌کند و نباید در فروش واقعی بماند.
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger('Payments');

  constructor(private readonly orders: OrdersService) {}

  static get provider(): 'zarinpal' | 'sandbox' {
    return (process.env.ZARINPAL_MERCHANT_ID ?? '').trim() ? 'zarinpal' : 'sandbox';
  }

  static get zarinpalBase(): string {
    return (process.env.ZARINPAL_API_BASE ?? 'https://api.zarinpal.com').replace(/\/+$/, '');
  }

  static get publicUrl(): string {
    return (process.env.PUBLIC_API_URL ?? '').trim().replace(/\/+$/, '');
  }

  /** مبلغ‌ها در پنل تومان‌اند؛ زرین‌پال ریال می‌خواهد. */
  static toRial(toman: number): number {
    return toman * 10;
  }

  async start(shopId: string, order: { id: string; code: string; total: number; customerPhone: string }, publicUrl: string): Promise<{ url: string; provider: string }> {
    // درگاه واقعی https می‌خواهد (زرین‌پال آدرس http را نمی‌پذیرد). درگاه آزمایشی
    // عمداً http را هم قبول می‌کند تا اجرای محلی بدون تونل هم قابل تست باشد.
    const needsHttps = PaymentsService.provider === 'zarinpal' || process.env.NODE_ENV === 'production';
    if (needsHttps && !publicUrl.startsWith('https://')) {
      throw new BadRequestException('آدرس عمومی سرویس (https) لازم است تا لینک پرداخت ساخته شود.');
    }

    if (PaymentsService.provider === 'sandbox') {
      const authority = `sbx_${randomBytes(12).toString('hex')}`;
      await this.orders.attachPayment(shopId, order.id, { provider: 'sandbox', authority });
      return { url: `${publicUrl}/payments/sandbox/${authority}`, provider: 'sandbox' };
    }

    const merchantId = (process.env.ZARINPAL_MERCHANT_ID ?? '').trim();
    const body = {
      merchant_id: merchantId,
      amount: PaymentsService.toRial(order.total),
      description: `سفارش ${order.code}`,
      // زرین‌پال آدرس callback را باید https و عمومی باشد؛ بعد از بازگشت،
      // شماره سفارش از روی authority پیدا می‌شود.
      callback_url: `${publicUrl}/payments/zarinpal/callback`,
      metadata: { mobile: order.customerPhone.replace(/^0/, '') },
    };

    const response = await fetch(`${PaymentsService.zarinpalBase}/pg/v4/payment/request.json`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    }).catch(error => {
      this.logger.error(`zarinpal request failed: ${String(error)}`);
      throw new BadRequestException('ارتباط با درگاه پرداخت برقرار نشد.');
    });

    const payload = await response.json().catch(() => null) as
      | { data?: { code?: number; authority?: string }; errors?: unknown }
      | null;
    const authority = payload?.data?.authority;
    if (!response.ok || !authority) {
      this.logger.error(`zarinpal rejected: ${JSON.stringify(payload)?.slice(0, 300)}`);
      throw new BadRequestException('درگاه پرداخت درخواست را نپذیرفت.');
    }

    await this.orders.attachPayment(shopId, order.id, { provider: 'zarinpal', authority });
    return { url: `https://www.zarinpal.com/pg/StartPay/${authority}`, provider: 'zarinpal' };
  }

  /** بازگشت از زرین‌پال. Status=OK یعنی کاربر پرداخت کرده، نه اینکه پول رسیده باشد. */
  async verifyZarinpal(authority: string, status: string) {
    if (!authority) return { ok: false as const, reason: 'missing_authority' as const };
    if (status !== 'OK') return { ok: false as const, reason: 'cancelled_by_user' as const };

    const merchantId = (process.env.ZARINPAL_MERCHANT_ID ?? '').trim();
    const order = await this.findByAuthority(authority);
    if (!order) return { ok: false as const, reason: 'order_not_found' as const };

    const response = await fetch(`${PaymentsService.zarinpalBase}/pg/v4/payment/verify.json`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ merchant_id: merchantId, amount: PaymentsService.toRial(order.total), authority }),
      signal: AbortSignal.timeout(15000),
    }).catch(() => null);

    const payload = response ? await response.json().catch(() => null) as
      | { data?: { code?: number; ref_id?: number | string }; errors?: { code?: number; message?: string } }
      | null : null;
    const code = payload?.data?.code;
    // 100 = پرداخت موفق، 101 = قبلاً verify شده (idempotent).
    if (code !== 100 && code !== 101) {
      this.logger.warn(`zarinpal verify ${authority}: code=${String(code)} errors=${JSON.stringify(payload?.errors ?? {})}`);
      return { ok: false as const, reason: 'verify_failed' as const, message: payload?.errors?.message };
    }

    const paid = await this.orders.markPaid({
      authority,
      refId: payload?.data?.ref_id ? String(payload.data.ref_id) : '',
      provider: 'zarinpal',
    });
    return paid.ok ? { ok: true as const, order: paid.order, already: paid.already } : { ok: false as const, reason: paid.reason };
  }

  /** صفحه‌ی درگاه آزمایشی: GET با ok=1 تأیید، ok=0 انصراف. */
  async confirmSandbox(authority: string, ok: boolean) {
    const order = await this.findByAuthority(authority);
    if (!order) return { ok: false as const, reason: 'order_not_found' as const };
    if (!ok) return { ok: false as const, reason: 'cancelled_by_user' as const, order };
    const paid = await this.orders.markPaid({ authority, refId: `SBX-${Date.now().toString(36).toUpperCase()}`, provider: 'sandbox' });
    return paid.ok ? { ok: true as const, order: paid.order, already: paid.already } : { ok: false as const, reason: paid.reason };
  }

  private async findByAuthority(authority: string) {
    return this.orders.findByAuthority(authority);
  }

  /** صفحه‌ی درگاه آزمایشی به خلاصه‌ی سفارش نیاز دارد. */
  async orderByAuthority(authority: string) {
    return this.orders.findByAuthority(authority);
  }
}
