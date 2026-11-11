import { forwardRef, Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { OrdersModule } from '../orders/orders.module';
import { ChannelController } from './channel.controller';
import { ChatController } from '../chat/chat.controller';
import { ChatService } from '../chat/chat.service';
import { TelegramService } from './telegram.service';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { TelegramWebhookController } from './telegram.webhook.controller';

@Module({
  // چرخه با OrdersModule: بات سفارش می‌سازد و سفارش‌ها با بات اعلان می‌دهند.
  imports: [forwardRef(() => OrdersModule), AiModule, SubscriptionsModule],
  // «گفت‌وگوها و مشتریان» همان چت تلگرام است، پس در همین ماژول می‌ماند؛ اگر
  // ماژول جدا با import دوباره‌ی TelegramModule ساخته شود، چرخه‌ی
  // forwardRef با OrdersModule می‌شکند و PaymentsService دیگر OrdersService را
  // پیدا نمی‌کند (خطای واقعی که همین‌جا خوردیم).
  controllers: [TelegramWebhookController, ChannelController, ChatController],
  providers: [TelegramService, ChatService],
  exports: [TelegramService, ChatService],
})
export class TelegramModule {}
