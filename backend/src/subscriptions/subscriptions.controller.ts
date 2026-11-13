import { BadRequestException, Body, Controller, Get, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { z } from 'zod';
import { AuthGuard, Principal } from '../auth/auth.guard';
import { AdminGuard } from '../admin/admin.guard';
import { SubscriptionsService } from './subscriptions.service';

const checkoutSchema = z.object({
  planId: z.string().uuid(),
  months: z.number().int().min(1).max(18),
  extraInstagram: z.number().int().min(0).max(50).default(0),
  discountCode: z.string().max(40).default(''),
  orderSms: z.boolean().default(false),
});

const quoteSchema = z.object({
  planId: z.string().uuid(),
  months: z.number().int().min(1).max(18),
  extraInstagram: z.number().int().min(0).max(50).default(0),
  discountCode: z.string().max(40).default(''),
  orderSms: z.boolean().default(false),
});

@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly service: SubscriptionsService) {}

  @Get('plans') plans() { return this.service.plans(); }

  @Get('plans/:slug') plan(@Param('slug') slug: string) { return this.service.planBySlug(slug); }

  /** قیمت قطعی سمت سرور برای صفحه‌ی جزئیات پلن. */
  @Post('quote') quote(@Body() body: unknown) {
    const p = quoteSchema.safeParse(body);
    if (!p.success) throw new BadRequestException('پلن یا مدت اشتراک نامعتبر است.');
    return this.service.quote(p.data.planId, p.data.months, p.data.extraInstagram, p.data.discountCode, p.data.orderSms);
  }

  @Get('status') @UseGuards(AuthGuard) status(@Req() req: { principal: Principal }) { return this.service.status(req.principal.shopId); }

  @Post('checkout') @UseGuards(AuthGuard) checkout(@Req() req: { principal: Principal }, @Body() body: unknown) {
    const p = checkoutSchema.safeParse(body);
    if (!p.success) throw new BadRequestException('پلن یا مدت اشتراک نامعتبر است.');
    return this.service.checkout(req.principal.shopId, p.data.planId, p.data.months, p.data.extraInstagram, p.data.discountCode, (process.env.PUBLIC_API_URL ?? '').replace(/\/+$/, ''), p.data.orderSms);
  }

  /** خرید افزودنی پیامک سفارش از داخل پنل (برای اشتراک فعال). */
  @Post('order-sms-addon') @UseGuards(AuthGuard) orderSmsAddon(@Req() req: { principal: Principal }) {
    return this.service.purchaseOrderSmsAddon(req.principal.shopId, (process.env.PUBLIC_API_URL ?? '').replace(/\/+$/, ''));
  }

  @Get('callback') async callback(@Query('Authority') authority: string, @Query('Status') status: string, @Res() res: Response) {
    const result = await this.service.callback(authority ?? '', status ?? '');
    const base = (process.env.FRONTEND_URL ?? '').replace(/\/+$/, '');
    const path = result.ok ? '/app/settings?subscription=success' : '/app/settings?subscription=failed';
    return res.redirect(`${base}${path}`);
  }

  /** صفحه‌ی درگاه آزمایشی (وقتی زرین‌پال تنظیم نشده). */
  @Get('sandbox/:authority') async sandbox(@Param('authority') authority: string, @Res() res: Response) {
    const summary = await this.service.sandboxSummary(authority);
    if (!summary) return res.status(404).send('درخواست اشتراک پیدا نشد.');
    const toman = (n: number) => `${n.toLocaleString('fa-IR')} تومان`;
    const html = `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>پرداخت آزمایشی اشتراک</title></head>
<body style="margin:0;display:grid;place-items:center;min-height:100vh;background:#0c0d10;color:#f7f8f8;font:400 15px/1.9 Vazirmatn,Tahoma,system-ui,sans-serif">
<div style="max-width:420px;width:92%;background:#14161c;border:1px solid #262a33;border-radius:18px;padding:28px">
<div style="font-size:12px;color:#9aa1b1">درگاه آزمایشی — هیچ پولی جابه‌جا نمی‌شود</div>
<h1 style="font-size:20px;margin:8px 0">اشتراک ${summary.planName}</h1>
<p style="color:#c3c7d1">${summary.months.toLocaleString('fa-IR')} ماه${summary.extraInstagram ? ` + ${summary.extraInstagram.toLocaleString('fa-IR')} پیج اینستاگرام اضافه` : ''}</p>
<p style="font-size:22px;font-weight:800">${toman(summary.amount)}</p>
<div style="display:grid;gap:10px;margin-top:18px">
<a href="/subscriptions/sandbox/${authority}/confirm?ok=1" style="display:block;text-align:center;background:linear-gradient(135deg,#7c6cff,#5a48e8);color:#fff;border-radius:12px;padding:13px;text-decoration:none;font-weight:700">پرداخت موفق (آزمایشی)</a>
<a href="/subscriptions/sandbox/${authority}/confirm?ok=0" style="display:block;text-align:center;border:1px solid #262a33;color:#c3c7d1;border-radius:12px;padding:13px;text-decoration:none">انصراف</a>
</div></div></body></html>`;
    return res.type('html').send(html);
  }

  @Get('sandbox/:authority/confirm') async sandboxConfirm(@Param('authority') authority: string, @Query('ok') ok: string, @Res() res: Response) {
    const result = await this.service.confirmSandbox(authority, ok === '1');
    const base = (process.env.FRONTEND_URL ?? '').replace(/\/+$/, '');
    const path = result.ok ? '/app/settings?subscription=success' : '/app/settings?subscription=failed';
    return res.redirect(`${base}${path}`);
  }
}

@Controller('admin/plans')
@UseGuards(AdminGuard)
export class AdminPlansController {
  constructor(private readonly service: SubscriptionsService) {}
  @Get() list() { return this.service.adminList(); }
  @Post() save(@Req() req: { admin?: { id: string } }, @Body() body: unknown) {
    const p = z.object({
      id: z.string().uuid().optional(),
      slug: z.string().trim().min(2).max(60).optional(),
      name: z.string().trim().min(2).max(80),
      tagline: z.string().max(160).default(''),
      description: z.string().max(1000).default(''),
      features: z.array(z.string().max(200)).max(20).default([]),
      monthlyPrice: z.number().int().min(0).max(2147483647),
      listMonthlyPrice: z.number().int().min(0).max(2147483647).default(0),
      instagramLimit: z.number().int().min(0).max(1000),
      telegramLimit: z.number().int().min(0).max(1000),
      monthlyMessageLimit: z.number().int().min(0).max(100000000).default(0),
      productLimit: z.number().int().min(0).max(100000000).default(0),
      orderSmsIncluded: z.boolean().default(false),
      orderSmsMonthlyPrice: z.number().int().min(0).max(2147483647).default(0),
      isPopular: z.boolean().default(false),
      active: z.boolean(),
      sortOrder: z.number().int().min(0).max(10000),
    }).safeParse(body);
    if (!p.success || !req.admin) throw new BadRequestException(p.success ? 'شناسه مدیر پیدا نشد.' : p.error.issues[0]?.message);
    return this.service.savePlan(p.data, req.admin.id);
  }
}
