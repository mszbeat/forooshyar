import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ProductType } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { AuditService } from '../logging/audit.service';
import { TelegramService } from '../telegram/telegram.service';
import {
  diffCombinations,
  generateCombinations,
  sizeColorFromOptions,
} from './variant-combinations';

@Injectable()
export class CatalogService {
  constructor(
    private readonly db: PrismaService,
    private readonly audit: AuditService,
    // اعلان تلگرام اختیاری است: اگر TELEGRAM_BOT_TOKEN نباشد، notify خودش بی‌صدا رد می‌شود.
    private readonly telegram: TelegramService,
    // تغییر محصول/موجودی باید در پنل و داشبورد بی‌درنگ دیده شود.
    private readonly realtime: RealtimeService,
  ) {}
  async product(shopId: string, id: string) {
    const product = await this.db.product.findFirst({
      where: { shopId, id },
      include: {
        variants: true,
        attributes: { include: { values: { orderBy: { sortOrder: 'asc' } } }, orderBy: { sortOrder: 'asc' } },
      },
    });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }
  list(shopId: string) {
    return this.db.product.findMany({
      where: { shopId },
      include: {
        variants: true,
        attributes: { include: { values: { orderBy: { sortOrder: 'asc' } } }, orderBy: { sortOrder: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }
  async createProduct(shopId: string, input: {
    title: string; description?: string; category?: string;
    type?: ProductType; isShippable?: boolean;
    defaultPrice?: number | null; defaultStock?: number | null; compareAtPrice?: number | null;
    serviceDurationMinutes?: number | null; serviceRequiresBooking?: boolean; serviceCapacity?: number | null;
  }) {
    const product = await this.db.product.create({ data: { ...input, shopId } });
    this.audit.record({ action: 'product.create', entity: 'product', entityId: product.id, shopId, meta: { title: product.title, category: product.category, type: product.type } });
    this.realtime.emitShop(shopId, 'product', { id: product.id, reason: 'created' });
    this.realtime.emitAdmin('product', { shopId, reason: 'created' });
    return product;
  }
  async updateProduct(shopId: string, id: string, data: {
    title?: string; description?: string; category?: string; active?: boolean;
    type?: ProductType; isShippable?: boolean;
    defaultPrice?: number | null; defaultStock?: number | null; compareAtPrice?: number | null;
    serviceDurationMinutes?: number | null; serviceRequiresBooking?: boolean; serviceCapacity?: number | null;
  }) {
    const result = await this.db.product.updateMany({ where: { shopId, id }, data });
    if (!result.count) throw new NotFoundException('Product not found');
    const product = await this.product(shopId, id);
    this.audit.record({
      action: data.active === false ? 'product.archive' : 'product.update',
      entity: 'product', entityId: id, shopId,
      meta: { fields: Object.keys(data), title: product.title, ...(data.active !== undefined ? { active: data.active } : {}) },
    });
    this.realtime.emitShop(shopId, 'product', { id, reason: 'updated' });
    this.realtime.emitAdmin('product', { shopId, reason: 'updated' });
    return product;
  }
  async createVariant(shopId: string, userId: string, productId: string, data: { sku?: string; size?: string; color?: string; price: number; stock: number }) {
    try {
      const created = await this.db.$transaction(async tx => {
        const product = await tx.product.findFirst({ where: { shopId, id: productId }, select: { id: true } });
        if (!product) throw new NotFoundException('Product not found');
        const variant = await tx.variant.create({ data: { ...data, shopId, productId } });
        if (data.stock > 0) await tx.stockMovement.create({ data: { shopId, variantId: variant.id, delta: data.stock, reason: 'initial', actorId: userId } });
        return variant;
      });
      this.audit.record({
        action: 'variant.create', entity: 'variant', entityId: created.id, shopId,
        meta: { productId, sku: created.sku, size: created.size, color: created.color, price: created.price, stock: created.stock },
      });
      this.realtime.emitShop(shopId, 'product', { id: productId, reason: 'variant_created' });
      return created;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('SKU already exists');
      throw error;
    }
  }
  async updateVariant(shopId: string, id: string, data: { sku?: string | null; size?: string; color?: string; price?: number; active?: boolean }) {
    try {
      const result = await this.db.variant.updateMany({ where: { shopId, id }, data });
      if (!result.count) throw new NotFoundException('Variant not found');
      const variant = await this.db.variant.findFirstOrThrow({ where: { shopId, id } });
      this.audit.record({
        action: data.active === false ? 'variant.archive' : 'variant.update',
        entity: 'variant', entityId: id, shopId,
        meta: { fields: Object.keys(data), ...(data.price !== undefined ? { price: data.price } : {}), ...(data.sku !== undefined ? { sku: data.sku } : {}) },
      });
      this.realtime.emitShop(shopId, 'product', { id: variant.productId, reason: 'variant_updated' });
      return variant;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('SKU already exists');
      throw error;
    }
  }
  async getVariant(shopId: string, id: string) {
    const variant = await this.db.variant.findFirst({ where: { shopId, id } });
    if (!variant) throw new NotFoundException('Variant not found');
    return variant;
  }
  async sell(shopId: string, userId: string, variantId: string, quantity: number, requestKey?: string) {
    if (!requestKey) {
      const result = await this.changeStock(shopId, userId, variantId, -quantity, 'sale');
      this.audit.record({
        action: 'variant.sell', entity: 'variant', entityId: variantId, shopId, userId,
        meta: { quantity, stockAfter: result.stock, idempotencyKey: null },
      });
      void this.telegram.notifySale(shopId, variantId, quantity);
      this.realtime.emitShop(shopId, 'stock', { variantId, stockAfter: result.stock, reason: 'sale' });
      return result;
    }
    try {
      const sold = await this.db.$transaction(async tx => {
        const operation = await tx.stockOperation.create({ data: { shopId, variantId, requestKey, quantity } });
        const updated = await tx.variant.updateMany({ where: { id: variantId, shopId, active: true, product: { active: true }, stock: { gte: quantity } }, data: { stock: { decrement: quantity }, stockUpdatedAt: new Date() } });
        if (!updated.count) {
          const variant = await tx.variant.findFirst({ where: { id: variantId, shopId } });
          if (!variant) throw new NotFoundException('Variant not found');
          throw new ConflictException('Insufficient stock or inactive product');
        }
        const variant = await tx.variant.findFirstOrThrow({ where: { id: variantId, shopId } });
        await tx.stockMovement.create({ data: { shopId, variantId, delta: -quantity, reason: 'sale', actorId: userId } });
        await tx.stockOperation.update({ where: { id: operation.id }, data: { resultStock: variant.stock } });
        return variant;
      });
      this.audit.record({
        action: 'variant.sell', entity: 'variant', entityId: variantId, shopId, userId,
        meta: { quantity, stockAfter: sold.stock, idempotencyKey: requestKey },
      });
      void this.telegram.notifySale(shopId, variantId, quantity);
      this.realtime.emitShop(shopId, 'stock', { variantId, stockAfter: sold.stock, reason: 'sale' });
      return sold;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const prior = await this.db.stockOperation.findUnique({ where: { shopId_requestKey: { shopId, requestKey } } });
        if (!prior || prior.variantId !== variantId || prior.quantity !== quantity || prior.resultStock === null) throw new ConflictException('Idempotency key already used for a different sale');
        const variant = await this.getVariant(shopId, variantId);
        this.audit.record({
          action: 'variant.sell_replayed', entity: 'variant', entityId: variantId, shopId, userId,
          meta: { quantity, stockAfter: prior.resultStock, idempotencyKey: requestKey },
        });
        return { ...variant, stock: prior.resultStock };
      }
      // Composite FK prevents a request with an id from another tenant.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') throw new NotFoundException('Variant not found');
      throw error;
    }
  }
  async changeStock(shopId: string, userId: string, variantId: string, delta: number, reason: string) {
    const variant = await this.db.$transaction(async tx => {
      const result = await tx.variant.updateMany({ where: { id: variantId, shopId, ...(reason === 'sale' ? { active: true, product: { active: true } } : {}), stock: delta < 0 ? { gte: -delta } : { lte: 2147483647 - delta } }, data: { stock: { increment: delta }, stockUpdatedAt: new Date() } });
      if (!result.count) {
        const exists = await tx.variant.findFirst({ where: { id: variantId, shopId }, select: { id: true } });
        if (!exists) throw new NotFoundException('Variant not found');
        throw new ConflictException('Insufficient stock or stock limit exceeded');
      }
      await tx.stockMovement.create({ data: { shopId, variantId, delta, reason, actorId: userId } });
      return tx.variant.findFirstOrThrow({ where: { id: variantId, shopId } });
    });
    // افزایش موجودی → به مشتریانی که «خبرم کن» زده بودند اطلاع می‌دهیم.
    // عمداً await نمی‌شود: کندی تلگرام نباید ذخیره‌ی موجودی را معطل کند.
    if (delta > 0) {
      this.telegram.notifyRestock(shopId, variant.productId).catch((error: unknown) => {
        console.warn(`[restock] notify failed: ${String(error)}`);
      });
    }

    // `sell` writes its own, richer event; here we only log explicit adjustments.
    if (reason !== 'sale') {
      this.audit.record({
        action: reason === 'restock' ? 'variant.restock' : 'variant.stock_adjust',
        entity: 'variant', entityId: variantId, shopId, userId,
        meta: { delta, reason, stockAfter: variant.stock },
      });
    }
    this.realtime.emitShop(shopId, 'stock', { variantId, stockAfter: variant.stock, reason });
    return variant;
  }
  async movements(shopId: string, variantId: string) {
    const variant = await this.db.variant.findFirst({ where: { shopId, id: variantId }, select: { id: true } });
    if (!variant) throw new NotFoundException('Variant not found');
    return this.db.stockMovement.findMany({ where: { shopId, variantId }, orderBy: { createdAt: 'desc' }, take: 100 });
  }

  // -------------------------------------------------------------------------
  // ویژگی‌های آزاد محصول (K-V) و تولید ترکیب واریانت‌ها
  // -------------------------------------------------------------------------

  /** پیشنهاد نام ویژگی‌ها و مقادیر از ورودی‌های قبلی همین فروشگاه. */
  async attributeSuggestions(shopId: string) {
    const [names, values] = await Promise.all([
      this.db.productAttribute.groupBy({ by: ['name'], where: { shopId }, orderBy: { name: 'asc' } }),
      this.db.productAttributeValue.findMany({
        where: { shopId },
        include: { attribute: { select: { name: true } } },
        orderBy: { value: 'asc' },
        take: 500,
      }),
    ]);
    const valuesByName = new Map<string, string[]>();
    for (const row of values) {
      const list = valuesByName.get(row.attribute.name) ?? [];
      if (!list.includes(row.value)) list.push(row.value);
      valuesByName.set(row.attribute.name, list);
    }
    return {
      names: names.map((n) => n.name),
      valuesByName: Object.fromEntries(valuesByName),
    };
  }

  async setAttributes(shopId: string, productId: string, attributes: { name: string; values: string[] }[]) {
    const product = await this.db.product.findFirst({ where: { shopId, id: productId }, select: { id: true } });
    if (!product) throw new NotFoundException('Product not found');
    const cleaned = attributes
      .map((a) => ({
        name: a.name.trim(),
        values: [...new Set(a.values.map((v) => v.trim()).filter(Boolean))],
      }))
      .filter((a) => a.name && a.values.length > 0);
    const names = new Set(cleaned.map((a) => a.name));
    if (names.size !== cleaned.length) throw new BadRequestException('نام ویژگی تکراری است');

    await this.db.$transaction(async (tx) => {
      const existing = await tx.productAttribute.findMany({ where: { shopId, productId } });
      // ویژگی‌هایی که دیگر نیستند حذف می‌شوند (واریانت‌های موجود دست نمی‌خورند).
      const removed = existing.filter((a) => !names.has(a.name));
      if (removed.length) {
        await tx.productAttribute.deleteMany({ where: { shopId, productId, id: { in: removed.map((a) => a.id) } } });
      }
      for (let i = 0; i < cleaned.length; i++) {
        const attr = cleaned[i];
        const found = existing.find((a) => a.name === attr.name);
        if (!found) {
          await tx.productAttribute.create({
            data: {
              shopId, productId, name: attr.name, sortOrder: i,
              values: { create: attr.values.map((value, j) => ({ value, sortOrder: j })) },
            },
          });
        } else {
          await tx.productAttribute.update({
            where: { shopId_id: { shopId, id: found.id } },
            data: {
              sortOrder: i,
              values: {
                deleteMany: {},
                create: attr.values.map((value, j) => ({ shopId, value, sortOrder: j })),
              },
            },
          });
        }
      }
    });
    this.audit.record({ action: 'product.attributes_set', entity: 'product', entityId: productId, shopId, meta: { attributes: cleaned.map((a) => a.name) } });
    this.realtime.emitShop(shopId, 'product', { id: productId, reason: 'attributes_updated' });
    return this.product(shopId, productId);
  }

  /**
   * تولید ترکیب واریانت‌ها از ویژگی‌های محصول با diff:
   * ترکیب‌های موجود (و ویرایش‌هایشان) حفظ می‌شوند، ترکیب‌های جدید با
   * قیمت/موجودی پیش‌فرض محصول ساخته می‌شوند و ترکیب‌های حذف‌شده غیرفعال
   * می‌شوند تا تاریخچه‌ی سفارش‌ها نماند.
   */
  async generateVariants(shopId: string, userId: string, productId: string) {
    const product = await this.db.product.findFirst({
      where: { shopId, id: productId },
      include: {
        attributes: { include: { values: { orderBy: { sortOrder: 'asc' } } }, orderBy: { sortOrder: 'asc' } },
        variants: true,
      },
    });
    if (!product) throw new NotFoundException('Product not found');

    const generated = generateCombinations(
      product.attributes.map((a) => ({ name: a.name, values: a.values.map((v) => v.value) })),
    );
    const diff = diffCombinations(
      product.variants.map((v) => ({
        options: (v.optionsJson as Record<string, string>) ?? {},
        active: v.active,
      })),
      generated,
    );

    const defaultPrice = product.defaultPrice ?? 0;
    const defaultStock = product.defaultStock ?? 0;
    const result = await this.db.$transaction(async (tx) => {
      let created = 0;
      let deactivated = 0;
      for (const combo of diff.toCreate) {
        const { size, color } = sizeColorFromOptions(combo.options);
        const variant = await tx.variant.create({
          data: {
            shopId, productId,
            size, color,
            optionsJson: combo.options as Prisma.InputJsonValue,
            price: defaultPrice,
            stock: defaultStock,
          },
        });
        if (defaultStock > 0) {
          await tx.stockMovement.create({ data: { shopId, variantId: variant.id, delta: defaultStock, reason: 'initial', actorId: userId } });
        }
        created++;
      }
      for (const combo of diff.toDeactivate) {
        const { size, color } = sizeColorFromOptions(combo.options);
        await tx.variant.updateMany({
          where: { shopId, productId, size, color, active: true },
          data: { active: false },
        });
        deactivated++;
      }
      return { created, kept: diff.toKeep.length, deactivated };
    });

    this.audit.record({
      action: 'product.variants_generated', entity: 'product', entityId: productId, shopId,
      meta: { ...result, defaultPrice, defaultStock },
    });
    this.realtime.emitShop(shopId, 'product', { id: productId, reason: 'variants_generated' });
    return { ...result, product: await this.product(shopId, productId) };
  }

  /** عملیات گروهی روی واریانت‌های یک محصول: تنظیم قیمت/موجودی (مطلق یا درصدی). */
  async bulkUpdateVariants(shopId: string, userId: string, productId: string, input: {
    variantIds?: string[];
    priceMode?: 'set' | 'percent';
    priceValue?: number;
    stockMode?: 'set' | 'add';
    stockValue?: number;
  }) {
    const product = await this.db.product.findFirst({ where: { shopId, id: productId }, select: { id: true } });
    if (!product) throw new NotFoundException('Product not found');
    const variants = await this.db.variant.findMany({
      where: { shopId, productId, ...(input.variantIds?.length ? { id: { in: input.variantIds } } : {}) },
    });
    if (variants.length === 0) throw new BadRequestException('واریانتی برای به‌روزرسانی پیدا نشد');

    await this.db.$transaction(async (tx) => {
      for (const variant of variants) {
        const data: Prisma.VariantUpdateInput = {};
        if (input.priceMode === 'set' && input.priceValue !== undefined) data.price = input.priceValue;
        if (input.priceMode === 'percent' && input.priceValue !== undefined) {
          data.price = Math.max(0, Math.round(variant.price * (1 + input.priceValue / 100)));
        }
        if (Object.keys(data).length) {
          await tx.variant.update({ where: { shopId_id: { shopId, id: variant.id } }, data });
        }
        if (input.stockMode && input.stockValue !== undefined) {
          const delta = input.stockMode === 'set' ? input.stockValue - variant.stock : input.stockValue;
          if (delta !== 0) {
            if (variant.stock + delta < 0) throw new BadRequestException('موجودی نمی‌تواند منفی شود');
            await tx.variant.update({ where: { shopId_id: { shopId, id: variant.id } }, data: { stock: { increment: delta }, stockUpdatedAt: new Date() } });
            await tx.stockMovement.create({ data: { shopId, variantId: variant.id, delta, reason: 'adjustment', actorId: userId } });
          }
        }
      }
    });
    this.audit.record({
      action: 'product.variants_bulk', entity: 'product', entityId: productId, shopId,
      meta: { count: variants.length, priceMode: input.priceMode, stockMode: input.stockMode },
    });
    this.realtime.emitShop(shopId, 'product', { id: productId, reason: 'variants_bulk' });
    return { updated: variants.length };
  }
}
