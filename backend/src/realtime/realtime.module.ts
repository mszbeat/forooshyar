import { Global, Module } from '@nestjs/common';
import { AdminGuard } from '../admin/admin.guard';
import { AuthGuard } from '../auth/auth.guard';
import { EventsController } from './events.controller';
import { RealtimeService } from './realtime.service';

/**
 * Global: هر سرویسی که چیزی را تغییر می‌دهد باید بتواند رخداد بفرستد
 * (سفارش، موجودی، گفتگو، تنظیمات) بدون اینکه ماژولش به این ماژول وابسته شود.
 */
@Global()
@Module({
  controllers: [EventsController],
  providers: [RealtimeService, AuthGuard, AdminGuard],
  exports: [RealtimeService],
})
export class RealtimeModule {}
