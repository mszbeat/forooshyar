import { BadRequestException, Body, Controller, Delete, Get, Post, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AuthGuard, Principal } from '../auth/auth.guard';
import { InstagramService } from './instagram.service';

/**
 * اتصال پیج اینستاگرام، برای فروشنده.
 *
 * چرا مالکیت پیج اینجاست و نه در env: هر فروشگاه پیج خودش را دارد. env فقط
 * «حساب باکس‌ای‌پی پلتفرم» را می‌دهد (کلید API و لینک ورود)؛ اینکه کدام پیج
 * مال کدام فروشگاه است، در دیتابیس و با انتخاب خود فروشنده مشخص می‌شود.
 *
 * هیچ مسیری توکن یا سکرت را برنمی‌گرداند — حتی ماسک‌شده.
 */
@Controller('instagram')
@UseGuards(AuthGuard)
export class InstagramController {
  constructor(private readonly instagram: InstagramService) {}

  @Get('status')
  status(@Req() req: { principal: Principal }) {
    return this.instagram.status(req.principal.shopId);
  }

  /**
   * لینک ورود حساب (Page Onboarding).
   *
   * چرا جدا از `status` و با احراز هویت: این لینک داخلش توکن ورود دارد. دادنش
   * در پاسخ وضعیت یعنی هر کسی که پنل را باز کند آن را می‌بیند؛ اینجا فقط
   * فروشنده‌ی وارد‌شده و هنگام کلیک می‌گیردش. خودِ `status` هیچ لینکی ندارد.
   */
  @Get('connect-url')
  connectUrl(@Req() req: { principal: Principal }) {
    const url = this.instagram.connectUrl(req.principal.shopId, req.principal.userId);
    return url ? { ok: true as const, url } : { ok: false as const, error: 'لینک ورود اینستاگرام روی سرور تنظیم نشده است.' };
  }

  /** پیج‌های آماده‌ی انتخاب؛ فهرست از BoxAPI و فیلترشده بر اساس همین فروشگاه. */
  @Get('accounts')
  accounts(@Req() req: { principal: Principal }) {
    return this.instagram.accounts(req.principal.shopId);
  }

  @Post('link')
  async link(@Req() req: { principal: Principal }, @Body() body: unknown) {
    const parsed = z.object({
      accountId: z.string().trim().min(3, 'شناسه‌ی پیج معتبر نیست.').max(64),
    }).safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues[0]?.message ?? 'ورودی معتبر نیست.');
    return this.instagram.link(req.principal.shopId, parsed.data.accountId, req.principal.userId);
  }

  @Delete('link')
  unlink(@Req() req: { principal: Principal }) {
    return this.instagram.unlink(req.principal.shopId, req.principal.userId);
  }

  @Post('test')
  async test(@Req() req: { principal: Principal }, @Body() body: unknown) {
    const parsed = z.object({
      recipientId: z.string().trim().regex(/^\d{5,32}$/u, 'شناسه‌ی گیرنده باید عددی باشد (مثل 17841400000000000).'),
    }).safeParse(body);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? 'ورودی معتبر نیست.' };
    }
    return this.instagram.sendTest(req.principal.shopId, parsed.data.recipientId);
  }
}
