import { Controller, Get, Post, Body, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AuthGuard, Principal } from '../auth/auth.guard';
import { InstagramService } from './instagram.service';

/**
 * وضعیت و آزمایش اتصال اینستاگرام برای فروشنده.
 *
 * چرا اینجا و نه پنل ادمین: فروشنده صاحب حساب اینستاگرام است و باید خودش
 * ببیند وصل شده یا نه. آدرس webhook هم همین‌جا نمایش داده می‌شود تا کپی‌کردنش
 * در داشبورد BoxAPI یک قدم باشد.
 *
 * هیچ مسیری توکن یا سکرت را برنمی‌گرداند — حتی ماسک‌شده، حتی به فروشنده.
 */
@Controller('instagram')
@UseGuards(AuthGuard)
export class InstagramController {
  constructor(private readonly instagram: InstagramService) {}

  @Get('status')
  status(@Req() req: { principal: Principal }) {
    return this.instagram.status(req.principal.shopId);
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
