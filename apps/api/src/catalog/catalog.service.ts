import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class CatalogService {
  constructor(private readonly db: PrismaService) {}
  async product(shopId: string, id: string) {
    const product = await this.db.product.findFirst({ where: { shopId, id }, include: { variants: true } });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }
  list(shopId: string) {
    return this.db.product.findMany({ where: { shopId }, include: { variants: true }, orderBy: { createdAt: 'desc' }, take: 100 });
  }
  createProduct(shopId: string, input: { title: string; description?: string; category?: string }) {
    return this.db.product.create({ data: { ...input, shopId } });
  }
  async updateProduct(shopId: string, id: string, data: { title?: string; description?: string; category?: string; active?: boolean }) {
    const result = await this.db.product.updateMany({ where: { shopId, id }, data });
    if (!result.count) throw new NotFoundException('Product not found');
    return this.product(shopId, id);
  }
  async createVariant(shopId: string, userId: string, productId: string, data: { sku?: string; size?: string; color?: string; price: number; stock: number }) {
    try {
      return await this.db.$transaction(async tx => {
        const product = await tx.product.findFirst({ where: { shopId, id: productId }, select: { id: true } });
        if (!product) throw new NotFoundException('Product not found');
        const variant = await tx.variant.create({ data: { ...data, shopId, productId } });
        if (data.stock > 0) await tx.stockMovement.create({ data: { shopId, variantId: variant.id, delta: data.stock, reason: 'initial', actorId: userId } });
        return variant;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('SKU already exists');
      throw error;
    }
  }
  async updateVariant(shopId: string, id: string, data: { sku?: string | null; size?: string; color?: string; price?: number; active?: boolean }) {
    try {
      const result = await this.db.variant.updateMany({ where: { shopId, id }, data });
      if (!result.count) throw new NotFoundException('Variant not found');
      return this.db.variant.findFirstOrThrow({ where: { shopId, id } });
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
    if (!requestKey) return this.changeStock(shopId, userId, variantId, -quantity, 'sale');
    try {
      return await this.db.$transaction(async tx => {
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
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const prior = await this.db.stockOperation.findUnique({ where: { shopId_requestKey: { shopId, requestKey } } });
        if (!prior || prior.variantId !== variantId || prior.quantity !== quantity || prior.resultStock === null) throw new ConflictException('Idempotency key already used for a different sale');
        const variant = await this.getVariant(shopId, variantId);
        return { ...variant, stock: prior.resultStock };
      }
      // Composite FK prevents a request with an id from another tenant.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') throw new NotFoundException('Variant not found');
      throw error;
    }
  }
  async changeStock(shopId: string, userId: string, variantId: string, delta: number, reason: string) {
    return this.db.$transaction(async tx => {
      const result = await tx.variant.updateMany({ where: { id: variantId, shopId, ...(reason === 'sale' ? { active: true, product: { active: true } } : {}), stock: delta < 0 ? { gte: -delta } : { lte: 2147483647 - delta } }, data: { stock: { increment: delta }, stockUpdatedAt: new Date() } });
      if (!result.count) {
        const exists = await tx.variant.findFirst({ where: { id: variantId, shopId }, select: { id: true } });
        if (!exists) throw new NotFoundException('Variant not found');
        throw new ConflictException('Insufficient stock or stock limit exceeded');
      }
      await tx.stockMovement.create({ data: { shopId, variantId, delta, reason, actorId: userId } });
      return tx.variant.findFirstOrThrow({ where: { id: variantId, shopId } });
    });
  }
  async movements(shopId: string, variantId: string) {
    const variant = await this.db.variant.findFirst({ where: { shopId, id: variantId }, select: { id: true } });
    if (!variant) throw new NotFoundException('Variant not found');
    return this.db.stockMovement.findMany({ where: { shopId, variantId }, orderBy: { createdAt: 'desc' }, take: 100 });
  }
}
