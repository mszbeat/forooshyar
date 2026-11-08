import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { AdminAuthController, AdminController } from './admin.controller';
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';
import { SettingsService } from './settings.service';

/**
 * پنل ادمین پلتفرم.
 *
 * `SettingsService` صادر می‌شود تا بقیه‌ی ماژول‌ها (در آینده) بتوانند مقدار
 * مؤثر یک تنظیم را بخوانند؛ فعلاً خودِ `process.env` همین نقش را دارد.
 */
@Module({
  imports: [AiModule],
  controllers: [AdminAuthController, AdminController],
  providers: [AdminService, SettingsService, AdminGuard],
  exports: [SettingsService, AdminService],
})
export class AdminModule {}
