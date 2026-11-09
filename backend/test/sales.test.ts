import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { ReportsService } from '../src/reports/reports.service';
import type { PrismaService } from '../src/database/prisma.service';

/**
 * رگرسیون «فروش امروز».
 *
 * باگ گزارش‌شده: مشتری دو سفارش داده و پولش را پرداخت کرده بود، ولی کارت
 * «فروش امروز» داشبورد صفر می‌ماند. علتش این بود که گزارش‌ها فقط حرکت‌های
 * موجودی با دلیل `sale` (فروش دستی از پنل) را می‌شمردند؛ ثبت سفارش حرکت را
 * با دلیل `order` می‌نویسد، پس فروش واقعی هیچ‌وقت شمرده نمی‌شد.
 *
 * این تست فقط با دیتابیس واقعی اجرا می‌شود (TEST_DATABASE_URL)؛ بدون آن
 * رد می‌شود تا اجرای عادی `npm test` به PostgreSQL نیاز نداشته باشد.
 */
const databaseUrl = process.env.TEST_DATABASE_URL;

test('reports: «فروش امروز» سفارش‌های پرداخت‌شده را می‌شمارد و لغوشده‌ها را نه', { skip: !databaseUrl, timeout: 60000 }, async () => {
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl! } } });
  const run = randomUUID();

  const user = await db.user.create({
    data: { email: `sales-${run}@example.com`, passwordHash: 'not-used-in-this-test' },
  });
  const shop = await db.shop.create({
    data: { ownerId: user.id, name: `فروشگاه آزمون ${run}` },
  });

  try {
    const product = await db.product.create({
      data: { shopId: shop.id, title: 'مانتو آزمون', category: 'مانتو', description: '' },
    });
    const variant = await db.variant.create({
      data: { shopId: shop.id, productId: product.id, size: 'M', color: 'کرم', price: 1_000_000, stock: 50, sku: `T-${run}` },
    });

    const now = new Date();
    const makeOrder = (code: string, status: 'PAID' | 'CANCELLED' | 'AWAITING_PAYMENT', quantity: number, paidAt: Date | null) =>
      db.order.create({
        data: {
          shopId: shop.id,
          code,
          status: status as any,
          customerName: 'مشتری آزمون',
          customerPhone: '09120000000',
          total: quantity * 1_000_000,
          paidAt,
          items: { create: [{ shopId: shop.id, variantId: variant.id, title: product.title, spec: 'M · کرم', price: 1_000_000, quantity }] },
        },
      });

    // ۲ عدد پرداخت‌شده‌ی امروز → باید ۲ عدد و ۲٬۰۰۰٬۰۰۰ تومان شمرده شود.
    await makeOrder(`PAID-${run}`, 'PAID', 2, now);
    // سفارش لغوشده‌ی امروز → نباید شمرده شود.
    await makeOrder(`CANCEL-${run}`, 'CANCELLED', 5, null);
    // سفارش پرداخت‌نشده‌ی امروز → نباید شمرده شود.
    await makeOrder(`WAIT-${run}`, 'AWAITING_PAYMENT', 7, null);

    // فروش دستی از پنل (حرکت موجودی با دلیل sale) → ۱ عدد و ۱٬۰۰۰٬۰۰۰ تومان.
    await db.stockMovement.create({
      data: { shopId: shop.id, variantId: variant.id, delta: -1, reason: 'sale', actorId: user.id },
    });

    const reports = new ReportsService(db as unknown as PrismaService);
    const summary = await reports.summary(shop.id);

    assert.equal(summary.sales.today.units, 3, '۲ عدد سفارش + ۱ عدد فروش دستی');
    assert.equal(summary.sales.today.revenue, 3_000_000, '۲٬۰۰۰٬۰۰۰ سفارش + ۱٬۰۰۰٬۰۰۰ فروش دستی');

    const last = summary.sales.series.at(-1)!;
    assert.equal(last.units, 3, 'نمودار هفته هم باید همین فروش امروز را نشان دهد');
    assert.equal(last.revenue, 3_000_000);
  } finally {
    // پاک‌سازی: همه‌ی داده‌ی آزمون با حذف فروشگاه می‌رود.
    await db.order.deleteMany({ where: { shopId: shop.id } });
    await db.stockMovement.deleteMany({ where: { shopId: shop.id } });
    await db.variant.deleteMany({ where: { shopId: shop.id } });
    await db.product.deleteMany({ where: { shopId: shop.id } });
    await db.shop.delete({ where: { id: shop.id } });
    await db.user.delete({ where: { id: user.id } });
    await db.$disconnect();
  }
});
