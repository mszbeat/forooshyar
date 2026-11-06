import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

const DAY = 24 * 60 * 60 * 1000;
const LOW_STOCK_THRESHOLD = 3;
const STALE_AFTER_DAYS = 14;

export type SalesPoint = { date: string; units: number; revenue: number };

@Injectable()
export class ReportsService {
  constructor(private readonly db: PrismaService) {}

  /** Dashboard aggregate. Every number is derived from PostgreSQL; nothing is estimated. */
  async summary(shopId: string) {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(startOfToday.getTime() - 6 * DAY);
    const staleBefore = new Date(now.getTime() - STALE_AFTER_DAYS * DAY);

    const [products, variants, sales, recent] = await Promise.all([
      this.db.product.findMany({ where: { shopId }, select: { id: true, active: true, createdAt: true } }),
      this.db.variant.findMany({ where: { shopId }, select: { id: true, price: true, stock: true, active: true, stockUpdatedAt: true, productId: true } }),
      this.db.stockMovement.findMany({ where: { shopId, reason: 'sale', createdAt: { gte: weekStart } }, select: { delta: true, createdAt: true, variant: { select: { price: true } } } }),
      this.recentMovements(shopId, 8),
    ]);

    const activeVariants = variants.filter(variant => variant.active);
    const activeProductIds = new Set(products.filter(product => product.active).map(product => product.id));
    const sellable = activeVariants.filter(variant => activeProductIds.has(variant.productId));

    const totalStock = sellable.reduce((sum, variant) => sum + variant.stock, 0);
    const outOfStock = sellable.filter(variant => variant.stock === 0).length;
    const lowStock = sellable.filter(variant => variant.stock > 0 && variant.stock <= LOW_STOCK_THRESHOLD).length;
    const stale = sellable.filter(variant => variant.stock > 0 && variant.stockUpdatedAt < staleBefore).length;
    const inventoryValue = sellable.reduce((sum, variant) => sum + variant.stock * variant.price, 0);

    const series: SalesPoint[] = [];
    for (let index = 6; index >= 0; index -= 1) {
      const dayStart = new Date(startOfToday.getTime() - index * DAY);
      series.push({ date: dayStart.toISOString().slice(0, 10), units: 0, revenue: 0 });
    }
    const seriesIndex = new Map(series.map(point => [point.date, point]));
    let unitsToday = 0;
    let revenueToday = 0;
    for (const movement of sales) {
      const units = -movement.delta;
      const revenue = units * movement.variant.price;
      const key = new Date(movement.createdAt.getFullYear(), movement.createdAt.getMonth(), movement.createdAt.getDate()).toISOString().slice(0, 10);
      const point = seriesIndex.get(key);
      if (point) { point.units += units; point.revenue += revenue; }
      if (movement.createdAt >= startOfToday) { unitsToday += units; revenueToday += revenue; }
    }
    const unitsWeek = series.reduce((sum, point) => sum + point.units, 0);
    const revenueWeek = series.reduce((sum, point) => sum + point.revenue, 0);

    return {
      products: { total: products.length, active: products.filter(product => product.active).length },
      variants: { total: sellable.length, outOfStock, lowStock, stale },
      inventory: { totalStock, value: inventoryValue, lowStockThreshold: LOW_STOCK_THRESHOLD },
      sales: { today: { units: unitsToday, revenue: revenueToday }, week: { units: unitsWeek, revenue: revenueWeek }, series },
      recent,
    };
  }

  /** Cross-shop movement feed for the dashboard activity list. */
  recentMovements(shopId: string, take = 20) {
    return this.db.stockMovement.findMany({
      where: { shopId },
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        id: true, delta: true, reason: true, createdAt: true,
        variant: { select: { id: true, size: true, color: true, price: true, product: { select: { id: true, title: true } } } },
      },
    });
  }

  /** Variants that need attention: out of stock, running low or stale. */
  async attention(shopId: string, take = 10) {
    const staleBefore = new Date(Date.now() - STALE_AFTER_DAYS * DAY);
    const rows = await this.db.variant.findMany({
      where: { shopId, active: true, product: { active: true }, OR: [{ stock: { lte: LOW_STOCK_THRESHOLD } }, { stockUpdatedAt: { lt: staleBefore } }] },
      orderBy: [{ stock: 'asc' }, { stockUpdatedAt: 'asc' }],
      take,
      select: { id: true, size: true, color: true, price: true, stock: true, stockUpdatedAt: true, product: { select: { id: true, title: true } } },
    });
    return rows.map(row => ({
      ...row,
      severity: row.stock === 0 ? 'out' : row.stock <= LOW_STOCK_THRESHOLD ? 'low' : 'stale',
    }));
  }
}
