import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AuthGuard, Principal } from '../auth/auth.guard';
import { optionalText, parse, text } from '../common/validation';
import { PrismaService } from '../database/prisma.service';
const settings = z.object({ name: text.optional(), tone: optionalText.optional(), shipping: optionalText.optional(), payment: optionalText.optional(), workingHours: optionalText.optional(), handoffMessage: optionalText.optional() }).strict().refine(v => Object.keys(v).length > 0);
@Controller('shop')
@UseGuards(AuthGuard)
export class ShopController {
  constructor(private readonly db: PrismaService) {}
  @Get() get(@Req() req: { principal: Principal }) {
    return this.db.shop.findUniqueOrThrow({ where: { id: req.principal.shopId } });
  }
  @Patch() update(@Req() req: { principal: Principal }, @Body() body: unknown) {
    return this.db.shop.update({ where: { id: req.principal.shopId }, data: parse(settings, body) });
  }
}
