import { Module } from '@nestjs/common';
import { AiService } from './ai.service';

/** لایه‌ی مدل زبانی؛ در TelegramModule و AppModule استفاده می‌شود. */
@Module({ providers: [AiService], exports: [AiService] })
export class AiModule {}
