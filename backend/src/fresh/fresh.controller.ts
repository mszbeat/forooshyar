import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AuthGuard, Principal } from '../auth/auth.guard';
import { parse } from '../common/validation';
import { PrismaService } from '../database/prisma.service';
import { answerFresh } from './fresh';
const input = z.object({ message: z.string().trim().min(1).max(2000) }).strict();
@Controller('bot')
@UseGuards(AuthGuard)
export class FreshController {
  constructor(private readonly db: PrismaService) {}
  @Post('preview')
  async preview(@Req() req: { principal: Principal }, @Body() body: unknown) {
    const { message } = parse(input, body);
    const shopId = req.principal.shopId;
    const [shop, products] = await Promise.all([
      this.db.shop.findUniqueOrThrow({ where: { id: shopId }, select: { shipping: true, payment: true, workingHours: true, handoffMessage: true } }),
      this.db.product.findMany({ where: { shopId, active: true }, take: 501, select: { title: true, variants: { where: { active: true }, take: 2, select: { size: true, color: true, price: true, stock: true } } } }),
    ]);
    if (products.length > 500) return { kind: 'handoff', text: shop.handoffMessage.trim() || 'برای پاسخ دقیق‌تر با فروشنده هماهنگ می‌کنم.' };
    return answerFresh(message, shop, products);
  }
}
