import { Module } from '@nestjs/common';
import { ChannelsController } from './channels.controller';
import { ChannelsService } from './channels.service';
import { MessengerWebhookController } from './messenger.webhook.controller';

/**
 * اتصال‌های کانال (اینستاگرام/تلگرام/بله/روبیکا).
 * پردازش پیام هر کانال در ماژول خودش می‌ماند؛ این ماژول اتصال‌ها و webhook
 * بات‌های مشترک بله/روبیکا را مدیریت می‌کند.
 */
@Module({
  controllers: [ChannelsController, MessengerWebhookController],
  providers: [ChannelsService],
  exports: [ChannelsService],
})
export class ChannelsModule {}
