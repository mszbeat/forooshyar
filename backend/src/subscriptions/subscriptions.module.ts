import { Module } from '@nestjs/common';
import { SubscriptionsController, AdminPlansController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';
import { AdminGuard } from '../admin/admin.guard';
@Module({ controllers: [SubscriptionsController, AdminPlansController], providers: [SubscriptionsService, AdminGuard], exports: [SubscriptionsService] })
export class SubscriptionsModule {}
