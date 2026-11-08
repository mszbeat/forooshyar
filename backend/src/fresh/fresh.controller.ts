import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AuthGuard, Principal } from '../auth/auth.guard';
import { parse } from '../common/validation';
import { PrismaService } from '../database/prisma.service';
import { composeReply, type BrainShop } from '../telegram/brain';

const input = z.object({ message: z.string().trim().min(1).max(2000) }).strict();

/**
 * پیش‌نمایش پاسخ بات از داخل پنل.
 *
 * عمداً **همان** `composeReply` را صدا می‌زند که بات تلگرام: اگر رفتار اینجا و
 * بات یکی نباشد، فروشنده چیزی می‌بیند که مشتری نمی‌بیند.
 */
@Controller('bot')
@UseGuards(AuthGuard)
export class FreshController {
  constructor(private readonly db: PrismaService) {}

  @Post('preview')
  async preview(@Req() req: { principal: Principal }, @Body() body: unknown) {
    const { message } = parse(input, body);
    const shopId = req.principal.shopId;
    const [shop, products] = await Promise.all([
      this.db.shop.findUniqueOrThrow({
        where: { id: shopId },
        select: { shipping: true, payment: true, workingHours: true, returns: true, handoffMessage: true, name: true },
      }),
      this.db.product.findMany({
        where: { shopId, active: true },
        take: 501,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, title: true, description: true, category: true,
          variants: { where: { active: true }, select: { id: true, size: true, color: true, price: true, stock: true } },
        },
      }),
    ]);
    if (products.length > 500) {
      return { kind: 'handoff', text: shop.handoffMessage.trim() || 'برای پاسخ دقیق‌تر با فروشنده هماهنگ می‌کنم.' };
    }
    const reply = composeReply(message, shop as BrainShop, products);
    return { kind: reply.kind, reason: reply.reason, text: reply.text };
  }
}
