import { Module } from '@nestjs/common';
import { ShopPaymentMethodsController } from './shop-payment-methods.controller';
import { ShopPaymentMethodsService } from './shop-payment-methods.service';

/**
 * پرداخت فروشگاه = کارت‌به‌کارت.
 *
 * درگاه آنلاین فقط برای فروش پلن/اعتبار به فروشنده است و در ماژول
 * subscriptions زندگی می‌کند؛ هیچ درگاه/لینک پرداختی در سطح فروشگاه نیست.
 */
@Module({
  controllers: [ShopPaymentMethodsController],
  providers: [ShopPaymentMethodsService],
  exports: [ShopPaymentMethodsService],
})
export class PaymentsModule {}
