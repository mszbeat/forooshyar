import { BadRequestException, Body, Controller, Get, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { z } from 'zod';
import { AuthGuard, Principal } from '../auth/auth.guard';
import { AdminGuard } from '../admin/admin.guard';
import { SubscriptionsService } from './subscriptions.service';

@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly service: SubscriptionsService) {}
  @Get('plans') plans() { return this.service.plans(); }
  @Get('status') @UseGuards(AuthGuard) status(@Req() req: { principal: Principal }) { return this.service.status(req.principal.shopId); }
  @Post('checkout') @UseGuards(AuthGuard) checkout(@Req() req: { principal: Principal }, @Body() body: unknown) {
    const p = z.object({ planId: z.string().uuid(), months: z.number().int().min(1).max(18) }).safeParse(body);
    if (!p.success) throw new BadRequestException('پلن یا مدت اشتراک نامعتبر است.');
    return this.service.checkout(req.principal.shopId, p.data.planId, p.data.months, (process.env.PUBLIC_API_URL ?? '').replace(/\/+$/, ''));
  }
  @Get('callback') async callback(@Query('Authority') authority: string, @Query('Status') status: string, @Res() res: Response) {
    const result = await this.service.callback(authority ?? '', status ?? '');
    const base = (process.env.FRONTEND_URL ?? '').replace(/\/+$/, '');
    const path = result.ok ? '/app/settings?subscription=success' : `/app/settings?subscription=failed`;
    return res.redirect(`${base}${path}`);
  }
}

@Controller('admin/plans')
@UseGuards(AdminGuard)
export class AdminPlansController {
  constructor(private readonly service: SubscriptionsService) {}
  @Get() list() { return this.service.adminList(); }
  @Post() save(@Req() req: { admin?: { id: string } }, @Body() body: unknown) {
    const p = z.object({ id: z.string().uuid().optional(), name: z.string().trim().min(2).max(80), monthlyPrice: z.number().int().min(0).max(2147483647), instagramLimit: z.number().int().min(0).max(1000), telegramLimit: z.number().int().min(0).max(1000), active: z.boolean(), sortOrder: z.number().int().min(0).max(10000) }).safeParse(body);
    if (!p.success || !req.admin) throw new BadRequestException(p.success ? 'شناسه مدیر پیدا نشد.' : p.error.issues[0]?.message);
    return this.service.savePlan(p.data, req.admin.id);
  }
}
