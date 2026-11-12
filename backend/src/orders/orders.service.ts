import { BadRequestException, ConflictException, forwardRef, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { AuditService } from '../logging/audit.service';
import { TelegramService } from '../telegram/telegram.service';
import { InstagramService } from '../instagram/instagram.service';
import { SmsService } from '../sms/sms.service';

export type NewOrderItem = { variantId: string; quantity: number };

export type NewOrder = {
  chatId?: string;
  customerName: string;
  customerPhone: string;
  /** نشانی یک‌خطی آماده (از fullAddress ساخته می‌شود) */
  address: string;
  province?: string;
  city?: string;
  street?: string;
  alley?: string;
  plaque?: string;
  unit?: string;
  postalCode?: string;
  note?: string;
  items: NewOrderItem[];
};

/** سفارش پرداخت‌نشده بعد از این مدت با بازگشت موجودی لغو می‌شود. */
export const ORDER_EXPIRY_HOURS = 24;

const toman = (value: number) => `${value.toLocaleString('fa-IR')} تومان`;

function orderCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let index = 0; index < 6; index += 1) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `FY-${out}`;
}

/**
 * سفارش‌ها.
 *
 * قاعده‌ی موجودی: **هنگام ساخت سفارش** رزرو می‌شود، نه هنگام پرداخت. اگر
 * پرداخت انجام نشد و سفارش لغو/منقضی شد، موجودی برمی‌گردد. دلیلش ساده است: اگر
 * رزرو تا پرداخت صبر کند، دو مشتری می‌توانند هم‌زمان یک عدد آخر را بخرند و
 * یکی‌شان پول داده و جنس ندارد.
 *
 * هر تغییر موجودی یک StockMovement با دلیل `order` / `order_cancel` می‌نویسد،
 * پس تاریخچه‌ی موجودی پنل هم همین رزروها را نشان می‌دهد.
 */
@Injectable()
export class OrdersService {
  private readonly logger = new Logger('Orders');

  constructor(
    private readonly db: PrismaService,
    private readonly audit: AuditService,
    // چرخه با TelegramModule؛ بدون forwardRef این‌جا، Nest نمی‌تواند بسازد.
    @Inject(forwardRef(() => TelegramService)) private readonly telegram: TelegramService,
    // رخداد زنده: پنل باز بدون رفرش می‌فهمد سفارشی ثبت/تغییر شد.
    private readonly realtime: RealtimeService,
    @Inject(forwardRef(() => InstagramService)) private readonly instagram: InstagramService,
    private readonly sms: SmsService,
  ) {}

  // ------------------------------------------------------------------ ایجاد
  async create(shopId: string, input: NewOrder) {
    if (!input.items.length) throw new BadRequestException('سفارش بدون قلم است.');
    if (input.items.some(item => !Number.isInteger(item.quantity) || item.quantity < 1)) {
      throw new BadRequestException('تعداد هر قلم باید عدد صحیح مثبت باشد.');
    }

    const created = await this.db.$transaction(async tx => {
      const items: Prisma.OrderItemUncheckedCreateWithoutOrderInput[] = [];
      let total = 0;

      for (const line of input.items) {
        // decrement شرطی: اگر موجودی کافی نباشد هیچ ردیفی به‌روز نمی‌شود.
        const result = await tx.variant.updateMany({
          where: {
            id: line.variantId,
            shopId,
            active: true,
            stock: { gte: line.quantity },
            product: { active: true },
          },
          data: { stock: { decrement: line.quantity }, stockUpdatedAt: new Date() },
        });
        if (!result.count) throw new ConflictException('موجودی این محصول کافی نیست یا غیرفعال شده است.');

        const variant = await tx.variant.findFirstOrThrow({
          where: { shopId, id: line.variantId },
          select: { id: true, price: true, size: true, color: true, product: { select: { title: true } } },
        });
        const spec = [variant.size ? `سایز ${variant.size}` : '', variant.color ? `رنگ ${variant.color}` : ''].filter(Boolean).join('، ');
        total += variant.price * line.quantity;

        await tx.stockMovement.create({
          data: { shopId, variantId: variant.id, delta: -line.quantity, reason: 'order', actorId: SHOP_ACTOR },
        });
        items.push({ shopId, variantId: variant.id, title: variant.product.title, spec, price: variant.price, quantity: line.quantity });
      }

      return tx.order.create({
        data: {
          shopId,
          code: orderCode(),
          status: OrderStatus.AWAITING_PAYMENT,
          chatId: input.chatId ?? null,
          customerName: input.customerName,
          customerPhone: input.customerPhone,
          address: input.address,
          province: input.province ?? '',
          city: input.city ?? '',
          street: input.street ?? '',
          alley: input.alley ?? '',
          plaque: input.plaque ?? '',
          unit: input.unit ?? '',
          postalCode: input.postalCode ?? '',
          note: input.note ?? '',
          total,
          items: { create: items },
        },
        include: { items: true },
      });
    });

    this.audit.record({
      action: 'order.create',
      entity: 'order',
      entityId: created.id,
      shopId,
      meta: { code: created.code, total: created.total, items: created.items.length, chatId: input.chatId ?? null },
    });
    // پنل باز، سفارش تازه را بدون رفرش می‌بیند؛ موجودی هم عوض شده است.
    this.realtime.emitShop(shopId, 'order', { id: created.id, code: created.code, status: created.status, reason: 'created' });
    this.realtime.emitShop(shopId, 'stock', { reason: 'order', orderId: created.id });
    this.realtime.emitAdmin('order', { shopId, status: created.status });
    return created;
  }

  // ------------------------------------------------------------------ پرداخت
  /**
   * پرداخت موفق. idempotent است: اگر کاربر دو بار روی لینک برگشت بزند یا درگاه
   * دوباره callback بزند، موجودی و اعلان تکرار نمی‌شود.
   */
  async markPaid(input: { authority: string; refId?: string; provider?: string }) {
    const order = await this.db.order.findFirst({
      where: { paymentAuthority: input.authority },
      include: { items: true, shop: { select: { id: true, name: true, smsPhone: true, notifySellerBySms: true } } },
    });
    if (!order) return { ok: false as const, reason: 'order_not_found' as const };

    if (order.status === OrderStatus.PAID || order.status === OrderStatus.SHIPPED || order.status === OrderStatus.COMPLETED) {
      return { ok: true as const, order, already: true };
    }
    if (order.status === OrderStatus.CANCELLED) {
      // پول گرفته شده ولی سفارش لغو شده؛ فروشنده باید بداند تا مرجوع کند.
      await this.telegram.notifyOwner(order.shopId, [
        `⚠️ پرداخت برای سفارش لغوشده ${order.code} انجام شد.`,
        `مبلغ: ${toman(order.total)}`,
        `کد پیگیری: ${input.refId ?? '—'}`,
        'این سفارش باید مرجوع شود یا دستی بررسی شود.',
      ].join('\n'));
      this.audit.record({ action: 'order.paid_after_cancel', entity: 'order', entityId: order.id, shopId: order.shopId, meta: { code: order.code } });
      return { ok: false as const, reason: 'cancelled' as const, order };
    }

    const paid = await this.db.order.update({
      where: { id: order.id },
      data: {
        status: OrderStatus.PAID,
        paidAt: new Date(),
        paymentRefId: input.refId ?? '',
        paymentProvider: input.provider ?? order.paymentProvider,
      },
      include: { items: true },
    });

    this.audit.record({
      action: 'order.paid',
      entity: 'order',
      entityId: paid.id,
      shopId: paid.shopId,
      meta: { code: paid.code, total: paid.total, refId: paid.paymentRefId, provider: paid.paymentProvider },
    });

    // اعلان به فروشنده و مشتری؛ خطای تلگرام نباید پرداخت را بشکند.
    void this.notifySeller(paid.id).catch(error => this.logger.warn(`notifySeller: ${String(error)}`));
    const message = [`✅ پرداخت شما تأیید شد. سفارش ${paid.code} ثبت شد.`, `${paid.items.map(item => `• ${item.title}${item.spec ? ` (${item.spec})` : ''} × ${item.quantity.toLocaleString('fa-IR')}`).join('\n')}`, `مبلغ: ${toman(paid.total)}`, '', 'فروشنده برای ارسال هماهنگ می‌کند. این کد را نگه دارید.'].join('\n');
    if (paid.chatId) {
      const send = paid.chatId.startsWith('ig:') ? this.instagram.sendOrderConfirmation(paid.shopId, paid.chatId, message) : this.telegram.sendTo(paid.chatId, message);
      void send.catch(error => this.logger.warn(`customer payment notification failed: ${String(error)}`));
    }
    // Required customer notification (Mock until provider selection); seller is opt-in.
    void this.sms.send(paid.customerPhone, `پرداخت تأیید شد؛ سفارش ${paid.code} به مبلغ ${toman(paid.total)} ثبت شد.`, 'order_customer', paid.shopId).catch(error => this.logger.warn(`customer SMS failed: ${String(error)}`));
    if (order.shop.notifySellerBySms && order.shop.smsPhone) void this.sms.send(order.shop.smsPhone, `سفارش ${paid.code} پرداخت شد. مبلغ ${toman(paid.total)}؛ مشتری ${order.customerName || '—'}.`, 'order_seller', paid.shopId).catch(error => this.logger.warn(`seller SMS failed: ${String(error)}`));

    return { ok: true as const, order: paid, already: false };
  }

  /** نشانی خوانا برای پیام فروشنده؛ فیلدهای خالی حذف می‌شوند. */
  static addressLines(order: {
    province: string; city: string; street: string; alley: string;
    plaque: string; unit: string; postalCode: string; address: string;
  }): string {
    if (!order.province && !order.city && !order.street) return order.address || '—';
    const lines = [
      [order.province, order.city].filter(Boolean).join('، '),
      order.street,
      order.alley && order.alley !== 'ندارد' ? `کوچه ${order.alley}` : '',
      [order.plaque ? `پلاک ${order.plaque}` : '', order.unit && order.unit !== 'ندارد' ? `واحد ${order.unit}` : ''].filter(Boolean).join('، '),
      order.postalCode ? `کد پستی ${order.postalCode}` : '',
    ].filter(Boolean);
    return lines.join('\n');
  }

  /** پیام کامل سفارش برای فروشنده؛ از پنل هم قابل بازخوانی است. */
  async notifySeller(orderId: string) {
    const order = await this.db.order.findUnique({ where: { id: orderId }, include: { items: true } });
    if (!order) return;
    await this.telegram.notifyOwner(order.shopId, [
      `🧾 سفارش پرداخت‌شده ${order.code}`,
      order.items.map(item => `• ${item.title}${item.spec ? ` (${item.spec})` : ''} × ${item.quantity.toLocaleString('fa-IR')} — ${toman(item.price * item.quantity)}`).join('\n'),
      `مبلغ کل: ${toman(order.total)}`,
      '',
      `👤 گیرنده: ${order.customerName}`,
      `📱 موبایل: ${order.customerPhone}`,
      '📍 نشانی:',
      OrdersService.addressLines(order),
      order.note ? `📝 یادداشت: ${order.note}` : '',
      '',
      'برای تغییر وضعیت (ارسال شد/تحویل) به پنل → سفارش‌ها بروید.',
      '💬 برای پاسخ به مشتری، روی همین پیام «پاسخ» بزنید.',
    ].filter(Boolean).join('\n'));
  }

  // ------------------------------------------------------------------ لغو/انقضا
  async cancel(shopId: string, orderId: string, reason = 'seller') {
    const cancelled = await this.db.$transaction(async tx => {
      const order = await tx.order.findFirst({ where: { shopId, id: orderId }, include: { items: true } });
      if (!order) throw new NotFoundException('سفارش پیدا نشد.');
      if (order.status === OrderStatus.CANCELLED) return { order, changed: false };
      if (order.status !== OrderStatus.AWAITING_PAYMENT && order.status !== OrderStatus.PAID) {
        throw new ConflictException('این سفارش در این وضعیت قابل لغو نیست.');
      }

      // موجودی رزرو‌شده برمی‌گردد؛ سفارش پرداخت‌شده هم لغو می‌شود ولی فروشنده
      // باید بداند که پول باید مرجوع شود (در پیام آمده).
      for (const item of order.items) {
        if (!item.variantId) continue;
        await tx.variant.updateMany({
          where: { shopId, id: item.variantId },
          data: { stock: { increment: item.quantity }, stockUpdatedAt: new Date() },
        });
        await tx.stockMovement.create({
          data: { shopId, variantId: item.variantId, delta: item.quantity, reason: 'order_cancel', actorId: SHOP_ACTOR },
        });
      }

      const updated = await tx.order.update({
        where: { id: order.id },
        data: { status: OrderStatus.CANCELLED, cancelledReason: reason },
        include: { items: true },
      });
      return { order: updated, changed: true };
    });

    // لغو سفارش موجودی را برمی‌گرداند؛ اگر مشتری منتظر شارژ همان محصول بود، خبر شود.
    if (cancelled.changed) {
      for (const item of cancelled.order.items) {
        if (item.variantId) void this.notifyRestockForVariant(shopId, item.variantId);
      }
    }

    if (cancelled.changed) {
      this.audit.record({
        action: 'order.cancel',
        entity: 'order',
        entityId: cancelled.order.id,
        shopId,
        meta: { code: cancelled.order.code, reason },
      });
      if (cancelled.order.chatId) {
        void this.telegram
          .sendTo(cancelled.order.chatId, `سفارش ${cancelled.order.code} لغو شد. اگر پرداختی انجام داده‌اید، فروشنده مرجوع می‌کند.`)
          .catch(() => undefined);
      }
    }
    return cancelled.order;
  }

  /** سفارش‌های پرداخت‌نشده‌ی قدیمی؛ موجودی‌شان برنمی‌گردد به فروشنده‌ی حریص نمی‌رسد. */
  async expireStale(shopId: string) {
    const cutoff = new Date(Date.now() - ORDER_EXPIRY_HOURS * 60 * 60 * 1000);
    const stale = await this.db.order.findMany({
      where: { shopId, status: OrderStatus.AWAITING_PAYMENT, createdAt: { lt: cutoff } },
      select: { id: true },
      take: 50,
    });
    for (const order of stale) {
      try {
        await this.cancel(shopId, order.id, 'expired');
      } catch (error) {
        this.logger.warn(`expire ${order.id}: ${String(error)}`);
      }
    }
    return stale.length;
  }

  // ------------------------------------------------------------------ پنل
  async list(shopId: string, query: { status?: string; limit?: number } = {}) {
    const status = Object.values(OrderStatus).includes(query.status as OrderStatus) ? (query.status as OrderStatus) : undefined;
    const orders = await this.db.order.findMany({
      where: { shopId, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(query.limit ?? 50, 1), 200),
      include: { items: true },
    });
    return orders.map(order => ({
      ...order,
      itemsCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
    }));
  }

  /** سفارش‌های یک چت تلگرام؛ برای دستور /orders. */
  listForChat(shopId: string, chatId: string, limit = 5) {
    return this.db.order.findMany({
      where: { shopId, chatId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { items: true },
    });
  }

  async detail(shopId: string, id: string) {
    const order = await this.db.order.findFirst({ where: { shopId, id }, include: { items: true } });
    if (!order) throw new NotFoundException('سفارش پیدا نشد.');
    return order;
  }

  /** برای کارت داشبورد. */
  async summary(shopId: string) {
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [awaiting, paidToday, cancelled, cancelledLast24h, recent] = await Promise.all([
      this.db.order.count({ where: { shopId, status: OrderStatus.AWAITING_PAYMENT } }),
      this.db.order.aggregate({
        where: { shopId, status: { in: [OrderStatus.PAID, OrderStatus.SHIPPED, OrderStatus.COMPLETED] }, paidAt: { gte: dayAgo } },
        _sum: { total: true },
        _count: true,
      }),
      // لغوشده‌ها: هم مجموع (برای این‌که فروشنده حجم لغو را ببیند) و هم ۲۴ ساعت
      // گذشته (برای این‌که اگر امروز چند سفارش لغو شده، فوراً به چشم بیاید).
      this.db.order.count({ where: { shopId, status: OrderStatus.CANCELLED } }),
      this.db.order.count({ where: { shopId, status: OrderStatus.CANCELLED, createdAt: { gte: dayAgo } } }),
      this.db.order.findMany({
        where: { shopId, status: { in: [OrderStatus.PAID, OrderStatus.SHIPPED] } },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, code: true, total: true, status: true, customerName: true, createdAt: true },
      }),
    ]);
    return {
      awaitingPayment: awaiting,
      paidLast24h: paidToday._count,
      revenueLast24h: paidToday._sum.total ?? 0,
      cancelled,
      cancelledLast24h,
      recent,
    };
  }

  // ------------------------------------------------------------------ گفتگو
  /** پیام‌های این سفارش/چت برای نمایش در پنل. */
  async messages(shopId: string, orderId: string) {
    const order = await this.db.order.findFirst({ where: { shopId, id: orderId }, select: { chatId: true } });
    if (!order) throw new NotFoundException('سفارش پیدا نشد.');
    if (!order.chatId) return [];
    return this.db.chatMessage.findMany({
      where: { shopId, chatId: order.chatId },
      orderBy: { createdAt: 'asc' },
      take: 50,
    });
  }

  /**
   * پیام فروشنده به مشتری از داخل پنل.
   *
   * همان مسیر بات را استفاده می‌کند (`deliverSellerMessage`) تا رفتار، تاریخچه و
   * audit در هر دو کانال یکسان باشد و پیام در تاریخچه‌ی گفتگو بنشیند.
   */
  async sendMessage(shopId: string, orderId: string, text: string, replyToId?: string) {
    const body = text.trim();
    if (!body) throw new BadRequestException('متن پیام خالی است.');
    if (body.length > 2000) throw new BadRequestException('متن پیام طولانی است (حداکثر ۲۰۰۰ کاراکتر).');

    const order = await this.db.order.findFirst({ where: { shopId, id: orderId }, select: { id: true, code: true, chatId: true } });
    if (!order) throw new NotFoundException('سفارش پیدا نشد.');
    if (!order.chatId) throw new ConflictException('این سفارش به چت تلگرام مشتری وصل نیست.');
    if (!this.telegram.configured) throw new ConflictException('بات تلگرام روی سرور پیکربندی نشده است.');

    // ریپلای: پیام مرجع باید از همان گفتگو باشد؛ وگرنه نقل‌قول بی‌معنا می‌شود.
    let reply: { id: string; text: string; from: 'in' | 'out' } | null = null;
    if (replyToId) {
      const source = await this.db.chatMessage.findFirst({
        where: { shopId, chatId: order.chatId, id: replyToId },
        select: { id: true, text: true, direction: true },
      });
      if (!source) throw new NotFoundException('پیامی که می‌خواهید به آن پاسخ دهید پیدا نشد.');
      reply = { id: source.id, text: source.text, from: source.direction === 'in' ? 'in' : 'out' };
    }

    const sent = await this.telegram.deliverSellerMessage({ shopId }, order.chatId, body, undefined, order.id, reply);
    if (!sent) throw new ConflictException('ارسال پیام ناموفق بود. ممکن است مشتری بات را بلاک کرده باشد.');
    return this.messages(shopId, orderId);
  }

  /**
   * اگر این واریانت موجود شده باشد، به منتظرانِ محصولش خبر می‌دهد.
   * عمداً fire-and-forget است: اعلان نباید لغو سفارش یا ثبت آن را کند/خراب کند.
   */
  private async notifyRestockForVariant(shopId: string, variantId: string) {
    try {
      const variant = await this.db.variant.findFirst({
        where: { shopId, id: variantId },
        select: { productId: true, stock: true },
      });
      if (!variant || variant.stock <= 0) return;
      await this.telegram.notifyRestock(shopId, variant.productId);
    } catch (error) {
      this.logger.warn(`restock notify failed: ${String(error)}`);
    }
  }

  /**
   * تأیید تحویل از طرف مشتری.
   *
   * چرا از سمت سرور و با تاریخچه: مشتری در چت می‌نویسد «تحویل گرفتم»؛ درست است
   * که همان لحظه وضعیت به COMPLETED برود و فروشنده هم خبردار شود — نه اینکه
   * منتظر بماند تا کسی در پنل دکمه را بزند.
   *
   * فقط آخرین سفارش «ارسال‌شده»ی همان چت انتخاب می‌شود؛ اگر چنین سفارشی نباشد
   * `null` برمی‌گردد و هیچ چیز تغییر نمی‌کند (تأیید بی‌مبنا، وضعیت را عوض نمی‌کند).
   */
  async confirmDeliveryByCustomer(shopId: string, chatId: string) {
    const order = await this.db.order.findFirst({
      where: { shopId, chatId, status: OrderStatus.SHIPPED },
      orderBy: { createdAt: 'desc' },
      select: { id: true, code: true, status: true, chatId: true, customerName: true },
    });
    if (!order) return null;

    const updated = await this.db.order.update({
      where: { id: order.id },
      data: { status: OrderStatus.COMPLETED },
      include: { items: true },
    });
    this.audit.record({
      action: 'order.delivery_confirmed',
      entity: 'order', entityId: order.id, shopId,
      meta: { code: order.code, from: order.status, to: OrderStatus.COMPLETED, by: 'customer' },
    });

    // اعلان برای فروشنده: این تغییر را مشتری زده، نه پنل؛ باید بداند.
    void this.telegram.notifyOwner(shopId, [
      `✅ <b>مشتری تحویل سفارش را تأیید کرد</b>`,
      `سفارش ${order.code} — ${order.customerName || 'مشتری'}`,
      `وضعیت به «تحویل‌شده» تغییر کرد.`,
    ].join('\n')).catch(() => undefined);
    this.realtime.emitShop(shopId, 'order', { id: order.id, code: order.code, status: OrderStatus.COMPLETED, reason: 'delivery_confirmed' });
    this.realtime.emitAdmin('order', { shopId, status: OrderStatus.COMPLETED });
    return updated;
  }

  /** تغییر وضعیت توسط فروشنده: PAID → SHIPPED → COMPLETED. */
  async setStatus(shopId: string, orderId: string, status: OrderStatus) {
    const order = await this.db.order.findFirst({ where: { shopId, id: orderId }, select: { id: true, status: true, code: true, chatId: true } });
    if (!order) throw new NotFoundException('سفارش پیدا نشد.');
    if (status === OrderStatus.CANCELLED) return this.cancel(shopId, orderId, 'seller');

    const allowed: Record<string, OrderStatus[]> = {
      [OrderStatus.PAID]: [OrderStatus.SHIPPED, OrderStatus.CANCELLED],
      [OrderStatus.SHIPPED]: [OrderStatus.COMPLETED, OrderStatus.CANCELLED],
    };
    if (!(allowed[order.status] ?? []).includes(status)) {
      throw new ConflictException('این تغییر وضعیت مجاز نیست.');
    }

    const updated = await this.db.order.update({ where: { id: orderId }, data: { status }, include: { items: true } });
    this.audit.record({
      action: 'order.status',
      entity: 'order',
      entityId: orderId,
      shopId,
      meta: { code: order.code, from: order.status, to: status },
    });
    this.realtime.emitShop(shopId, 'order', { id: orderId, code: order.code, status, reason: 'seller' });
    this.realtime.emitAdmin('order', { shopId, status });
    if (order.chatId) {
      const text = status === OrderStatus.SHIPPED
        ? `📦 سفارش ${order.code} ارسال شد.`
        : status === OrderStatus.COMPLETED
          ? `✅ سفارش ${order.code} تحویل شد. ممنون از خریدتان.`
          : '';
      if (text) void this.telegram.sendTo(order.chatId, text).catch(() => undefined);
    }
    return updated;
  }
}

/**
 * رزرو/برگشت موجودی خودکار است (مشتری در تلگرام، نه کاربر پنل). `actorId` در
 * StockMovement کلید خارجی به User ندارد، پس یک شناسه‌ی ثابت «سیستم» می‌گذاریم؛
 * در تاریخچه‌ی موجودی با همین مقدار قابل تشخیص است.
 */
const SHOP_ACTOR = '00000000-0000-0000-0000-000000000000';
