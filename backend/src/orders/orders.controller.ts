import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { z } from 'zod';
import { AuthGuard, Principal } from '../auth/auth.guard';
import { OrdersService } from './orders.service';

const statusSchema = z.object({
  status: z.nativeEnum(OrderStatus),
});

const messageSchema = z.object({
  text: z.string().min(1, 'متن پیام خالی است.').max(2000, 'متن پیام طولانی است.'),
});

/**
 * سفارش‌ها در پنل. مثل بقیه‌ی مسیرها فقط به فروشگاه خودِ توکن دسترسی دارد
 * (`req.principal.shopId`)؛ شناسه‌ی سفارش از فروشگاه دیگری نتیجه‌ی ۴۰۴ می‌دهد.
 */
@Controller('orders')
@UseGuards(AuthGuard)
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  async list(
    @Req() req: { principal: Principal },
    @Query('status') status?: string,
    @Query('limit') limit?: string,
  ) {
    // سفارش‌های پرداخت‌نشده‌ی کهنه تازه اینجا آزاد می‌شوند؛ بدون cron هم درست می‌ماند.
    await this.orders.expireStale(req.principal.shopId);
    return this.orders.list(req.principal.shopId, { status, limit: limit ? Number(limit) : undefined });
  }

  @Get('summary')
  summary(@Req() req: { principal: Principal }) {
    return this.orders.summary(req.principal.shopId);
  }

  @Get(':id')
  detail(@Req() req: { principal: Principal }, @Param('id') id: string) {
    return this.orders.detail(req.principal.shopId, id);
  }

  /** تاریخچه‌ی گفتگو با مشتری این سفارش. */
  @Get(':id/messages')
  messages(@Req() req: { principal: Principal }, @Param('id') id: string) {
    return this.orders.messages(req.principal.shopId, id);
  }

  /** ارسال پیام فروشنده به مشتری در تلگرام. */
  @Post(':id/message')
  sendMessage(@Req() req: { principal: Principal }, @Param('id') id: string, @Body() body: unknown) {
    const input = messageSchema.parse(body);
    return this.orders.sendMessage(req.principal.shopId, id, input.text);
  }

  @Post(':id/status')
  setStatus(
    @Req() req: { principal: Principal },
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const input = statusSchema.parse(body);
    return this.orders.setStatus(req.principal.shopId, id, input.status);
  }
}
