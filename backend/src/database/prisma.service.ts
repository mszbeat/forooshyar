import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { loadConfig, warnOnRiskyPooler } from '../config';

/**
 * تنها نمونه‌ی PrismaClient در کل برنامه (singleton).
 *
 * DATABASE_URL اتصال runtime است و باید به pooler تراکنشی برود
 * (پورت 6543 با ?pgbouncer=true&connection_limit=5). DIRECT_URL فقط برای
 * مهاجرت‌ها استفاده می‌شود و Prisma آن را از env می‌خواند؛ این‌جا فقط
 * برای لاگ استارتاپ و هشدار pooler پرریسک استفاده می‌شود.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  private readonly logger = new Logger('Prisma');

  constructor() {
    const config = loadConfig(process.env);
    super({ datasources: { db: { url: config.DATABASE_URL } } });
    warnOnRiskyPooler(config.DATABASE_URL, this.logger);
  }

  async onModuleDestroy() { await this.$disconnect(); }
}
