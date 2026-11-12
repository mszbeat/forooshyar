import { Module } from '@nestjs/common';
import { AutomationController } from './automation.controller';
import { AutomationService } from './automation.service';

/**
 * اتوماسیون کامنت → دایرکت اینستاگرام.
 * پردازش رویدادها از webhook اینستاگرام صدا زده می‌شود.
 */
@Module({
  controllers: [AutomationController],
  providers: [AutomationService],
  exports: [AutomationService],
})
export class AutomationModule {}
