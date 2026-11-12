import { Module } from '@nestjs/common';
import { AssistantController } from './assistant.controller';
import { AssistantService } from './assistant.service';

/**
 * دانش (Q&A) و پرامپت‌های دستیار با نسخه‌ها.
 * لایه‌ی ایمنی قفل‌شده در کد است و از پنل قابل ویرایش نیست.
 */
@Module({
  controllers: [AssistantController],
  providers: [AssistantService],
  exports: [AssistantService],
})
export class AssistantModule {}
