import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

export interface CartItem { variantId: string; quantity: number; }

const CART_TTL_MS = 2 * 60 * 60 * 1000; // ۲ ساعت

/** سبد خرید سمت سرور برای هر گفتگو (تسک ۱۲). */
@Injectable()
export class CartService {
  constructor(private readonly db: PrismaService) {}

  async get(shopId: string, conversationId: string): Promise<CartItem[]> {
    const cart = await this.db.cart.findUnique({ where: { shopId_conversationId: { shopId, conversationId } } });
    if (!cart) return [];
    if (cart.expiresAt.getTime() < Date.now()) {
      await this.db.cart.delete({ where: { id: cart.id } }).catch(() => null);
      return [];
    }
    const raw = cart.itemsJson as unknown;
    return Array.isArray(raw) ? (raw as CartItem[]) : [];
  }

  async add(shopId: string, conversationId: string, variantId: string, quantity: number): Promise<CartItem[]> {
    if (!Number.isInteger(quantity) || quantity < 1) throw new BadRequestException('تعداد نامعتبر است');
    const items = await this.get(shopId, conversationId);
    const existing = items.find(i => i.variantId === variantId);
    if (existing) existing.quantity += quantity;
    else items.push({ variantId, quantity });
    await this.save(shopId, conversationId, items);
    return items;
  }

  async setQuantity(shopId: string, conversationId: string, variantId: string, quantity: number): Promise<CartItem[]> {
    const items = await this.get(shopId, conversationId);
    const next = quantity <= 0
      ? items.filter(i => i.variantId !== variantId)
      : items.map(i => (i.variantId === variantId ? { ...i, quantity } : i));
    await this.save(shopId, conversationId, next);
    return next;
  }

  async remove(shopId: string, conversationId: string, variantId: string): Promise<CartItem[]> {
    return this.setQuantity(shopId, conversationId, variantId, 0);
  }

  async clear(shopId: string, conversationId: string): Promise<void> {
    await this.db.cart.deleteMany({ where: { shopId, conversationId } });
  }

  /** اعتبارسنجی موجودی همه‌ی اقلام (قبل از ثبت سفارش). */
  async validate(shopId: string, items: CartItem[]): Promise<void> {
    for (const item of items) {
      const variant = await this.db.variant.findFirst({ where: { shopId, id: item.variantId }, select: { stock: true, active: true } });
      if (!variant || !variant.active) throw new BadRequestException('یکی از اقلام سبد دیگر موجود نیست');
      if (variant.stock < item.quantity) throw new BadRequestException('موجودی یکی از اقلام کافی نیست');
    }
  }

  private async save(shopId: string, conversationId: string, items: CartItem[]): Promise<void> {
    const expiresAt = new Date(Date.now() + CART_TTL_MS);
    await this.db.cart.upsert({
      where: { shopId_conversationId: { shopId, conversationId } },
      create: { shopId, conversationId, itemsJson: items as unknown as import('@prisma/client').Prisma.InputJsonValue, expiresAt },
      update: { itemsJson: items as unknown as import('@prisma/client').Prisma.InputJsonValue, expiresAt },
    });
  }
}
