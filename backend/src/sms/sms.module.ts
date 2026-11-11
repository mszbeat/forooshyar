import { Global, Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { LoggingModule } from '../logging/logging.module';
import { SmsService } from './sms.service';
@Global() @Module({imports:[DatabaseModule,LoggingModule],providers:[SmsService],exports:[SmsService]}) export class SmsModule {}
