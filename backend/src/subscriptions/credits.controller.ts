import { BadRequestException, Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { CreditsService } from './credits.service';
import { AuthGuard, Principal } from '../auth/auth.guard';

const buySchema = z.object({ packSlug: z.string().min(1).max(60) });

@Controller('credits')
@UseGuards(AuthGuard)
export class CreditsController {
  constructor(private readonly credits: CreditsService) {}

  @Get('balance')
  balance(@Req() req: { principal: Principal }) {
    return this.credits.balance(req.principal.shopId);
  }

  @Get('packs')
  packs() {
    return this.credits.packs();
  }

  @Get('recent')
  recent(@Req() req: { principal: Principal }) {
    return this.credits.recent(req.principal.shopId);
  }

  @Post('buy')
  buy(@Req() req: { principal: Principal }, @Body() body: unknown) {
    const p = buySchema.safeParse(body);
    if (!p.success) throw new BadRequestException('بسته‌ی اعتبار نامعتبر است.');
    // پرداخت درگاه پلتفرم در ماژول اشتراک انجام می‌شود؛ این نقطه‌ی
    // نهایی‌سازی خرید بسته است (پس از تأیید پرداخت).
    return this.credits.purchase(req.principal.shopId, p.data.packSlug, `pack:${p.data.packSlug}:${Date.now()}`);
  }
}
