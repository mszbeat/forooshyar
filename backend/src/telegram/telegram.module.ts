import { forwardRef, Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { ChannelController } from './channel.controller';
import { TelegramService } from './telegram.service';
import { TelegramWebhookController } from './telegram.webhook.controller';

@Module({
  // چرخه با OrdersModule: بات سفارش می‌سازد و سفارش‌ها با بات اعلان می‌دهند.
  imports: [forwardRef(() => OrdersModule)],
  controllers: [TelegramWebhookController, ChannelController],
  providers: [TelegramService],
  exports: [TelegramService],
})
export class TelegramModule {}
