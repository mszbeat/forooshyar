import { Module } from '@nestjs/common';
import { ChannelController } from './channel.controller';
import { TelegramService } from './telegram.service';
import { TelegramWebhookController } from './telegram.webhook.controller';

@Module({
  controllers: [TelegramWebhookController, ChannelController],
  providers: [TelegramService],
  exports: [TelegramService],
})
export class TelegramModule {}
