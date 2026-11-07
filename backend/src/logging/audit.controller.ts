import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AuthGuard, Principal } from '../auth/auth.guard';
import { parse } from '../common/validation';
import { PrismaService } from '../database/prisma.service';

const query = z.object({
  action: z.string().trim().max(100).optional(),
  entity: z.string().trim().max(60).optional(),
  success: z.enum(['true', 'false']).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().uuid().optional(),
}).strict();

/**
 * Read side of the audit trail. Always scoped to the caller's shop: an entry
 * with a null shopId (failed login, unknown route) is never returned here.
 */
@Controller('audit')
@UseGuards(AuthGuard)
export class AuditController {
  constructor(private readonly db: PrismaService) {}

  @Get()
  list(@Req() req: { principal: Principal }, @Query() raw: unknown) {
    const filter = parse(query, raw);
    return this.db.auditLog.findMany({
      where: {
        shopId: req.principal.shopId,
        ...(filter.action ? { action: filter.action } : {}),
        ...(filter.entity ? { entity: filter.entity } : {}),
        ...(filter.success ? { success: filter.success === 'true' } : {}),
        ...(filter.from || filter.to
          ? { createdAt: { ...(filter.from ? { gte: new Date(filter.from) } : {}), ...(filter.to ? { lte: new Date(filter.to) } : {}) } }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: filter.limit,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
    });
  }

  /** Distinct action names with counts — powers a filter dropdown. */
  @Get('actions')
  async actions(@Req() req: { principal: Principal }) {
    const rows = await this.db.auditLog.groupBy({
      by: ['action'],
      where: { shopId: req.principal.shopId },
      _count: { _all: true },
      orderBy: { _count: { action: 'desc' } },
      take: 100,
    });
    return rows.map(row => ({ action: row.action, count: row._count._all }));
  }
}
