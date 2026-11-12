import { Module } from '@nestjs/common';
import { ChannelsController } from './channels.controller';
import { ChannelsService } from './channels.service';

/**
 * اتصال‌های کانال (اینستاگرام/تلگرام/بله/روبیکا).
 * پردازش پیام هر کانال در ماژول خودش می‌ماند؛ این ماژول فقط اتصال‌ها را
 * مدیریت می‌کند.
 */
@Module({
  controllers: [ChannelsController],
  providers: [ChannelsService],
  exports: [ChannelsService],
})
export class ChannelsModule {}
