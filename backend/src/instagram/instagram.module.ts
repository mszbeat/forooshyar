import { forwardRef, Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { OrdersModule } from '../orders/orders.module';
import { TelegramModule } from '../telegram/telegram.module';
import { InstagramController } from './instagram.controller';
import { InstagramService } from './instagram.service';
import { InstagramWebhookController } from './instagram.webhook.controller';

/**
 * کانال اینستاگرام (دایرکت) روی BoxAPI.
 *
 * وابستگی‌ها عمدی‌اند:
 *  - `OrdersModule` با forwardRef، چون سفارش‌ها برای اعلان به تلگرام نیاز دارند و
 *    این ماژول برای ثبت سفارش به `OrdersService` (همان چرخه‌ی موجود تلگرام).
 *  - `TelegramModule` برای `notifyOwner`: اعلان فروشنده در **یک** جا می‌ماند
 *    (بات تلگرام)، حتی وقتی مشتری از اینستاگرام آمده است. دو کانال اعلان یعنی
 *    فروشنده دو جا باید چک کند.
 *  - `AiModule` برای مدل زبانی اختیاری، مثل تلگرام.
 */
@Module({
  imports: [forwardRef(() => OrdersModule), forwardRef(() => TelegramModule), AiModule],
  controllers: [InstagramWebhookController, InstagramController],
  providers: [InstagramService],
  exports: [InstagramService],
})
export class InstagramModule {}
