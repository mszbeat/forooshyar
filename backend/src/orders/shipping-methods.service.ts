import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../logging/audit.service';

const KINDS = new Set(['FIXED', 'FREE_OVER', 'TABLE', 'PICKUP']);

/** مدیریت روش‌های ارسال فروشگاه با قانون هزینه. */
@Injectable()
export class ShippingMethodsService {
  constructor(
    private readonly db: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(shopId: string) {
    return this.db.shippingMethod.findMany({
      where: { shopId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async create(shopId: string, input: {
    name: string; kind: string; baseCost: number; freeOver?: number | null;
    rules?: Record<string, number>;
  }) {
    if (!KINDS.has(input.kind)) throw new BadRequestException('نوع روش ارسال معتبر نیست.');
    const name = input.name.trim();
    if (!name) throw new BadRequestException('نام روش ارسال لازم است.');
    const count = await this.db.shippingMethod.count({ where: { shopId } });
    const row = await this.db.shippingMethod.create({
      data: {
        shopId,
        name,
        kind: input.kind,
        baseCost: input.kind === 'PICKUP' ? 0 : input.baseCost,
        freeOver: input.kind === 'FREE_OVER' ? (input.freeOver ?? null) : null,
        rulesJson: (input.rules ?? {}) as Prisma.InputJsonValue,
        sortOrder: count,
      },
    });
    this.audit.record({ action: 'shipping_method.create', entity: 'shipping_method', entityId: row.id, shopId, meta: { name, kind: row.kind } });
    return row;
  }

  async update(shopId: string, id: string, input: {
    name?: string; kind?: string; baseCost?: number; freeOver?: number | null;
    rules?: Record<string, number>; active?: boolean; sortOrder?: number;
  }) {
    const existing = await this.db.shippingMethod.findFirst({ where: { shopId, id } });
    if (!existing) throw new NotFoundException('روش ارسال پیدا نشد.');
    if (input.kind !== undefined && !KINDS.has(input.kind)) throw new BadRequestException('نوع روش ارسال معتبر نیست.');
    const data: Prisma.ShippingMethodUpdateInput = {};
    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name) throw new BadRequestException('نام روش ارسال لازم است.');
      data.name = name;
    }
    if (input.kind !== undefined) data.kind = input.kind;
    if (input.baseCost !== undefined) data.baseCost = input.baseCost;
    if (input.freeOver !== undefined) data.freeOver = input.freeOver;
    if (input.rules !== undefined) data.rulesJson = input.rules as Prisma.InputJsonValue;
    if (input.active !== undefined) data.active = input.active;
    if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder;
    const row = await this.db.shippingMethod.update({ where: { shopId_id: { shopId, id } }, data });
    this.audit.record({ action: 'shipping_method.update', entity: 'shipping_method', entityId: id, shopId, meta: { fields: Object.keys(data) } });
    return row;
  }

  async remove(shopId: string, id: string) {
    const result = await this.db.shippingMethod.deleteMany({ where: { shopId, id } });
    if (!result.count) throw new NotFoundException('روش ارسال پیدا نشد.');
    this.audit.record({ action: 'shipping_method.delete', entity: 'shipping_method', entityId: id, shopId });
    return { ok: true };
  }
}
