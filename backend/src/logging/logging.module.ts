import { Global, Module } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { DatabaseModule } from '../database/database.module';
import { RequestContextMiddleware } from './logging.middleware';
import { AuditController } from './audit.controller';
import { AUDIT_LOG_READS, AuditService } from './audit.service';

/**
 * Global: every feature module can inject AuditService without importing this.
 */
@Global()
@Module({
  imports: [DatabaseModule],
  controllers: [AuditController],
  providers: [
    AuditService,
    // AuditController is shop-scoped, so it needs the same guard as the rest.
    AuthGuard,
    // Reads are noisy: off by default, enable with AUDIT_LOG_READS=true.
    { provide: AUDIT_LOG_READS, useValue: process.env.AUDIT_LOG_READS === 'true' },
    RequestContextMiddleware,
  ],
  exports: [AuditService],
})
export class LoggingModule {}
