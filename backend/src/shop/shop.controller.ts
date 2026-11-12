import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AuthGuard, Principal } from '../auth/auth.guard';
import { optionalText, parse, text } from '../common/validation';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../logging/audit.service';
const settings = z.object({ name: text.optional(), tone: optionalText.optional(), shipping: optionalText.optional(), payment: optionalText.optional(), workingHours: optionalText.optional(), returns: optionalText.optional(), handoffMessage: optionalText.optional(), notifySellerBySms: z.boolean().optional(), smsEnabled: z.boolean().optional() }).strict().refine(v => Object.keys(v).length > 0);
@Controller('shop')
@UseGuards(AuthGuard)
export class ShopController {
  constructor(private readonly db: PrismaService, private readonly audit: AuditService) {}
  @Get() get(@Req() req: { principal: Principal }) {
    return this.db.shop.findUniqueOrThrow({ where: { id: req.principal.shopId } });
  }
  @Patch() async update(@Req() req: { principal: Principal }, @Body() body: unknown) {
    const data = parse(settings, body);
    const shop = await this.db.shop.update({ where: { id: req.principal.shopId }, data });
    this.audit.record({
      action: 'shop.update',
      entity: 'shop',
      entityId: shop.id,
      shopId: shop.id,
      userId: req.principal.userId,
      // which fields changed — never the values of free-text fields
      meta: { fields: Object.keys(data) },
    });
    return shop;
  }
}
