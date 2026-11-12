import { forwardRef, Module } from '@nestjs/common';
import { TelegramModule } from '../telegram/telegram.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { CartService } from './cart.service';
import { InstagramModule } from '../instagram/instagram.module';
import { SmsModule } from '../sms/sms.module';
import { AiModule } from '../ai/ai.module';
import { ShippingMethodsController } from './shipping-methods.controller';
import { ShippingMethodsService } from './shipping-methods.service';
import { ReceiptsController } from './receipts.controller';
import { ReceiptsService } from './receipts.service';

/**
 * سفارش‌ها، روش‌های ارسال و رسیدهای پرداخت.
 *
 * ارجاع چرخه‌ای عمدی و محدود است: `OrdersService` برای اعلان به `TelegramService`
 * نیاز دارد و بات برای ثبت سفارش به `OrdersService`. با forwardRef حل شده و
 * دامنه‌اش فقط همین دو سرویس است.
 */
@Module({
  imports: [forwardRef(() => TelegramModule), forwardRef(() => InstagramModule), SmsModule, AiModule],
  controllers: [OrdersController, ShippingMethodsController, ReceiptsController],
  providers: [OrdersService, ShippingMethodsService, ReceiptsService, CartService],
  exports: [OrdersService, ShippingMethodsService, ReceiptsService, CartService],
})
export class OrdersModule {}
