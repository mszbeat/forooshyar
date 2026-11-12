import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../logging/audit.service';

/**
 * اعتبار پاسخ AI: مانده‌ی هر فروشگاه از دفتر `AiCreditLedger` خوانده
 * می‌شود (مجموع delta). هر پاسخ AI یک واحد مصرف می‌کند.
 */
@Injectable()
export class CreditsService {
  constructor(
    private readonly db: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** مانده‌ی اعتبار یک فروشگاه. */
  async balance(shopId: string): Promise<number> {
    const result = await this.db.aiCreditLedger.aggregate({
      where: { shopId },
      _sum: { delta: true },
    });
    return result._sum.delta ?? 0;
  }

  /** آیا فروشگاه اعتبار کافی برای یک پاسخ AI دارد؟ */
  async canReply(shopId: string): Promise<boolean> {
    return (await this.balance(shopId)) > 0;
  }

  /**
   * ثبت مصرف یک پاسخ AI. اگر مانده صفر باشد، مصرف ثبت نمی‌شود و
   * `false` برمی‌گردد تا مسیر قاعده‌محور ادامه پیدا کند.
   */
  async consume(shopId: string, refId = ''): Promise<boolean> {
    const balance = await this.balance(shopId);
    if (balance <= 0) return false;
    await this.db.aiCreditLedger.create({
      data: { shopId, delta: -1, reason: 'ai_reply', refId },
    });
    return true;
  }

  /** افزودن اعتبار (خرید بسته یا هدیه‌ی ادمین). */
  async grant(shopId: string, credits: number, reason: string, refId = ''): Promise<number> {
    if (!Number.isInteger(credits) || credits <= 0) {
      throw new Error('تعداد اعتبار باید عدد صحیح مثبت باشد.');
    }
    await this.db.aiCreditLedger.create({
      data: { shopId, delta: credits, reason, refId },
    });
    this.audit.record({
      action: 'credits.grant',
      entity: 'credits',
      shopId,
      meta: { credits, reason, refId },
    });
    return this.balance(shopId);
  }

  /** فهرست بسته‌های فعال برای فروشنده. */
  async packs() {
    return this.db.creditPack.findMany({
      where: { active: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  /** خرید بسته: ثبت در دفتر (پرداخت درگاه پلتفرم در subscriptions انجام می‌شود). */
  async purchase(shopId: string, packSlug: string, refId: string): Promise<{ balance: number; pack: { slug: string; credits: number } }> {
    const pack = await this.db.creditPack.findFirst({ where: { slug: packSlug, active: true } });
    if (!pack) throw new NotFoundException('بسته‌ی اعتبار پیدا نشد.');
    const balance = await this.grant(shopId, pack.credits, 'pack_purchase', refId);
    return { balance, pack: { slug: pack.slug, credits: pack.credits } };
  }

  /** گزارش مصرف اخیر برای داشبورد. */
  async recent(shopId: string, take = 20) {
    return this.db.aiCreditLedger.findMany({
      where: { shopId },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }
}
