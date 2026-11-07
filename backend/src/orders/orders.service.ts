import { BadRequestException, ConflictException, forwardRef, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../logging/audit.service';
import { TelegramService } from '../telegram/telegram.service';

export type NewOrderItem = { variantId: string; quantity: number };

export type NewOrder = {
  chatId?: string;
  customerName: string;
  customerPhone: string;
  address: string;
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
    return created;
  }

  // ------------------------------------------------------------------ پرداخت
  async attachPayment(shopId: string, orderId: string, payment: { provider: string; authority: string }) {
    const result = await this.db.order.updateMany({
      where: { shopId, id: orderId, status: OrderStatus.AWAITING_PAYMENT },
      data: { paymentProvider: payment.provider, paymentAuthority: payment.authority },
    });
    if (!result.count) throw new NotFoundException('سفارش در انتظار پرداخت پیدا نشد.');
    this.audit.record({
      action: 'order.payment_started',
      entity: 'order',
      entityId: orderId,
      shopId,
      meta: { provider: payment.provider, authority: payment.authority },
    });
  }

  /**
   * پرداخت موفق. idempotent است: اگر کاربر دو بار روی لینک برگشت بزند یا درگاه
   * دوباره callback بزند، موجودی و اعلان تکرار نمی‌شود.
   */
  async markPaid(input: { authority: string; refId?: string; provider?: string }) {
    const order = await this.db.order.findFirst({
      where: { paymentAuthority: input.authority },
      include: { items: true, shop: { select: { id: true, name: true } } },
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
    if (paid.chatId) {
      void this.telegram.sendTo(paid.chatId, [
        `✅ پرداخت شما تأیید شد. سفارش ${paid.code} ثبت شد.`,
        `${paid.items.map(item => `• ${item.title}${item.spec ? ` (${item.spec})` : ''} × ${item.quantity.toLocaleString('fa-IR')}`).join('\n')}`,
        `مبلغ: ${toman(paid.total)}`,
        '',
        'فروشنده برای ارسال هماهنگ می‌کند. این کد را نگه دارید.',
      ].join('\n')).catch(() => undefined);
    }

    return { ok: true as const, order: paid, already: false };
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
      `گیرنده: ${order.customerName}`,
      `موبایل: ${order.customerPhone}`,
      `نشانی: ${order.address}`,
      order.note ? `یادداشت: ${order.note}` : '',
      '',
      'برای تغییر وضعیت (ارسال شد/تحویل) به پنل → سفارش‌ها بروید.',
    ].filter(Boolean).join('\n'));
  }

  /** سفارش از روی authority؛ صفحه‌ی پرداخت و verify از این استفاده می‌کنند. */
  findByAuthority(authority: string) {
    return this.db.order.findFirst({
      where: { paymentAuthority: authority },
      include: { items: true, shop: { select: { id: true, name: true } } },
    });
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
    const [awaiting, paidToday, recent] = await Promise.all([
      this.db.order.count({ where: { shopId, status: OrderStatus.AWAITING_PAYMENT } }),
      this.db.order.aggregate({
        where: { shopId, status: { in: [OrderStatus.PAID, OrderStatus.SHIPPED, OrderStatus.COMPLETED] }, paidAt: { gte: dayAgo } },
        _sum: { total: true },
        _count: true,
      }),
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
      recent,
    };
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
