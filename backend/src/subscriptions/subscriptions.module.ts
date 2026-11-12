import { Module } from '@nestjs/common';
import { SubscriptionsController, AdminPlansController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';
import { CreditsService } from './credits.service';
import { CreditsController } from './credits.controller';
import { AdminGuard } from '../admin/admin.guard';
@Module({ controllers: [SubscriptionsController, AdminPlansController, CreditsController], providers: [SubscriptionsService, CreditsService, AdminGuard], exports: [SubscriptionsService, CreditsService] })
export class SubscriptionsModule {}
