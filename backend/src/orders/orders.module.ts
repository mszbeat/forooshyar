import { forwardRef, Module } from '@nestjs/common';
import { TelegramModule } from '../telegram/telegram.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { PaymentsService } from '../payments/payments.service';
import { PaymentsController } from './payments.controller';

/**
 * سفارش‌ها و پرداخت.
 *
 * ارجاع چرخه‌ای عمدی و محدود است: `OrdersService` برای اعلان به `TelegramService`
 * نیاز دارد و بات برای ثبت سفارش به `OrdersService`. با forwardRef حل شده و
 * دامنه‌اش فقط همین دو سرویس است.
 */
@Module({
  imports: [forwardRef(() => TelegramModule)],
  controllers: [OrdersController, PaymentsController],
  providers: [OrdersService, PaymentsService],
  exports: [OrdersService, PaymentsService],
})
export class OrdersModule {}
