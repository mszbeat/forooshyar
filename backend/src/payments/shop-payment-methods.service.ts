import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../logging/audit.service';
import { encryptCard, hashCard, isValidCardNumber, maskCard } from './card-crypto';

export interface PaymentMethodView {
  id: string;
  holderName: string;
  masked: string;
  last4: string;
  bankName: string;
  sheba: string;
  instruction: string;
  active: boolean;
  sortOrder: number;
}

function toView(row: {
  id: string; holderName: string; cardLast4: string; bankName: string;
  sheba: string; instruction: string; active: boolean; sortOrder: number;
}): PaymentMethodView {
  return {
    id: row.id,
    holderName: row.holderName,
    masked: maskCard(row.cardLast4),
    last4: row.cardLast4,
    bankName: row.bankName,
    sheba: row.sheba,
    instruction: row.instruction,
    active: row.active,
    sortOrder: row.sortOrder,
  };
}

/**
 * روش‌های پرداخت کارت‌به‌کارت فروشگاه.
 * شماره کارت فقط رمزنگاری‌شده ذخیره می‌شود و در هیچ پاسخی برنمی‌گردد.
 */
@Injectable()
export class ShopPaymentMethodsService {
  constructor(
    private readonly db: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(shopId: string): Promise<PaymentMethodView[]> {
    const rows = await this.db.shopPaymentMethod.findMany({
      where: { shopId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map(toView);
  }

  /** روش‌های فعال برای نمایش به مشتری (در فلو سفارش). */
  async activeForCustomer(shopId: string): Promise<PaymentMethodView[]> {
    const rows = await this.db.shopPaymentMethod.findMany({
      where: { shopId, active: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map(toView);
  }

  async create(shopId: string, input: {
    holderName: string;
    cardNumber: string;
    bankName?: string;
    sheba?: string;
    instruction?: string;
  }): Promise<PaymentMethodView> {
    const digits = input.cardNumber.replace(/[\s-]/g, '');
    if (!isValidCardNumber(digits)) {
      throw new BadRequestException('شماره کارت معتبر نیست (۱۶ رقم و رقم کنترل).');
    }
    const holderName = input.holderName.trim();
    if (!holderName) throw new BadRequestException('نام دارنده‌ی کارت لازم است.');
    const sheba = (input.sheba ?? '').trim();
    if (sheba && !/^IR\d{24}$/i.test(sheba)) {
      throw new BadRequestException('شبا باید با IR شروع و ۲۶ کاراکتر باشد.');
    }
    const count = await this.db.shopPaymentMethod.count({ where: { shopId } });
    const row = await this.db.shopPaymentMethod.create({
      data: {
        shopId,
        holderName,
        cardNumberEnc: encryptCard(digits),
        cardHash: hashCard(digits),
        cardLast4: digits.slice(-4),
        bankName: (input.bankName ?? '').trim(),
        sheba,
        instruction: (input.instruction ?? '').trim(),
        sortOrder: count,
      },
    });
    this.audit.record({
      action: 'payment_method.create', entity: 'payment_method', entityId: row.id, shopId,
      meta: { holderName, last4: row.cardLast4, bankName: row.bankName },
    });
    return toView(row);
  }

  async update(shopId: string, id: string, input: {
    holderName?: string;
    cardNumber?: string;
    bankName?: string;
    sheba?: string;
    instruction?: string;
    active?: boolean;
    sortOrder?: number;
  }): Promise<PaymentMethodView> {
    const existing = await this.db.shopPaymentMethod.findFirst({ where: { shopId, id } });
    if (!existing) throw new NotFoundException('روش پرداخت پیدا نشد');
    const data: Record<string, unknown> = {};
    if (input.holderName !== undefined) {
      const holderName = input.holderName.trim();
      if (!holderName) throw new BadRequestException('نام دارنده‌ی کارت لازم است.');
      data.holderName = holderName;
    }
    if (input.cardNumber !== undefined) {
      const digits = input.cardNumber.replace(/[\s-]/g, '');
      if (!isValidCardNumber(digits)) throw new BadRequestException('شماره کارت معتبر نیست.');
      data.cardNumberEnc = encryptCard(digits);
      data.cardHash = hashCard(digits);
      data.cardLast4 = digits.slice(-4);
    }
    if (input.bankName !== undefined) data.bankName = input.bankName.trim();
    if (input.sheba !== undefined) {
      const sheba = input.sheba.trim();
      if (sheba && !/^IR\d{24}$/i.test(sheba)) throw new BadRequestException('شبا معتبر نیست.');
      data.sheba = sheba;
    }
    if (input.instruction !== undefined) data.instruction = input.instruction.trim();
    if (input.active !== undefined) data.active = input.active;
    if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder;

    const row = await this.db.shopPaymentMethod.update({
      where: { shopId_id: { shopId, id } },
      data,
    });
    this.audit.record({
      action: 'payment_method.update', entity: 'payment_method', entityId: id, shopId,
      meta: { fields: Object.keys(data), last4: row.cardLast4 },
    });
    return toView(row);
  }

  async remove(shopId: string, id: string): Promise<{ ok: true }> {
    const result = await this.db.shopPaymentMethod.deleteMany({ where: { shopId, id } });
    if (!result.count) throw new NotFoundException('روش پرداخت پیدا نشد');
    this.audit.record({ action: 'payment_method.delete', entity: 'payment_method', entityId: id, shopId });
    return { ok: true };
  }

  /** سیاست رسید: تأیید خودکار، سقف مبلغ و مهلت انتظار پرداخت. */
  async receiptPolicy(shopId: string) {
    const shop = await this.db.shop.findFirst({
      where: { id: shopId },
      select: { receiptAutoConfirm: true, receiptAutoConfirmMax: true, paymentWaitHours: true },
    });
    if (!shop) throw new NotFoundException('فروشگاه پیدا نشد');
    return shop;
  }

  async updateReceiptPolicy(shopId: string, input: {
    receiptAutoConfirm?: boolean;
    receiptAutoConfirmMax?: number | null;
    paymentWaitHours?: number;
  }) {
    const shop = await this.db.shop.findFirst({ where: { id: shopId }, select: { id: true } });
    if (!shop) throw new NotFoundException('فروشگاه پیدا نشد');
    const updated = await this.db.shop.update({
      where: { id: shopId },
      data: input,
      select: { receiptAutoConfirm: true, receiptAutoConfirmMax: true, paymentWaitHours: true },
    });
    this.audit.record({ action: 'shop.receipt_policy', entity: 'shop', entityId: shopId, shopId, meta: input });
    return updated;
  }
}
