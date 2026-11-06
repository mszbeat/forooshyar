import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { loadConfig } from '../config';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() { super({ datasources: { db: { url: loadConfig(process.env).DATABASE_URL } } }); }
  async onModuleDestroy() { await this.$disconnect(); }
}
