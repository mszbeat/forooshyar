import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../logging/audit.service';

@Injectable()
export class SubscriptionsService implements OnModuleInit {
  constructor(private readonly db: PrismaService, private readonly audit: AuditService) {}
  async onModuleInit() {
    const count = await this.db.subscriptionPlan.count().catch(() => 0);
    if (count) return;
    for (const [index, limit] of [1, 3, 10].entries()) {
      await this.db.subscriptionPlan.create({ data: { name: `پلن ${index + 1}`, monthlyPrice: 0, instagramLimit: limit, telegramLimit: limit, active: false, sortOrder: index } }).catch(() => undefined);
    }
  }
  async plans() {
    const rows = await this.db.subscriptionPlan.findMany({ where: { active: true }, orderBy: [{ sortOrder: 'asc' }, { monthlyPrice: 'asc' }] });
    return rows.map(p => ({ id: p.id, name: p.name, monthlyPrice: p.monthlyPrice, instagramLimit: p.instagramLimit, telegramLimit: p.telegramLimit }));
  }
  async status(shopId: string) {
    const [shop, current] = await Promise.all([
      this.db.shop.findUniqueOrThrow({ where: { id: shopId }, select: { trialStartedAt: true, trialEndsAt: true } }),
      this.db.subscription.findFirst({ where: { shopId, status: 'ACTIVE', endsAt: { gt: new Date() } }, include: { plan: true }, orderBy: { endsAt: 'desc' } }),
    ]);
    const trialActive = Boolean(shop.trialEndsAt && shop.trialEndsAt > new Date());
    return { active: Boolean(current) || trialActive, mode: current ? 'paid' : trialActive ? 'trial' : 'expired', trialStartedAt: shop.trialStartedAt?.toISOString() ?? null, trialEndsAt: shop.trialEndsAt?.toISOString() ?? null,
      subscription: current ? { planName: current.plan.name, startsAt: current.startsAt?.toISOString(), endsAt: current.endsAt?.toISOString(), months: current.months } : null, plans: await this.plans() };
  }
  async assertCanConnect(shopId: string) {
    if (!(await this.status(shopId)).active) throw new BadRequestException('دورهٔ آزمایشی تمام شده است. برای اتصال کانال، اشتراک را فعال کنید. داده‌های فروشگاه محفوظ است.');
  }
  async checkout(shopId: string, planId: string, months: number, publicUrl: string) {
    if (!Number.isInteger(months) || months < 1 || months > 18) throw new BadRequestException('مدت اشتراک باید بین ۱ تا ۱۸ ماه باشد.');
    if (!(process.env.ZARINPAL_MERCHANT_ID ?? '').trim()) throw new BadRequestException('درگاه پرداخت واقعی هنوز توسط مدیر سامانه فعال نشده است.');
    const plan = await this.db.subscriptionPlan.findFirst({ where: { id: planId, active: true } });
    if (!plan) throw new NotFoundException('پلن در دسترس نیست.');
    if (plan.monthlyPrice <= 0) throw new BadRequestException('قیمت این پلن هنوز تنظیم نشده است.');
    const amount = plan.monthlyPrice * months;
    if (!Number.isSafeInteger(amount) || amount <= 0) throw new BadRequestException('مبلغ اشتراک معتبر نیست.');
    if (!publicUrl.startsWith('https://')) throw new BadRequestException('PUBLIC_API_URL با HTTPS باید تنظیم شود.');
    const pending = await this.db.subscription.create({ data: { shopId, planId, months, amount, status: 'PENDING' } });
    const res = await fetch(`${(process.env.ZARINPAL_API_BASE ?? 'https://api.zarinpal.com').replace(/\/+$/, '')}/pg/v4/payment/request.json`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ merchant_id: process.env.ZARINPAL_MERCHANT_ID, amount: amount * 10, description: `اشتراک ${plan.name} - ${months} ماه`, callback_url: `${publicUrl}/subscriptions/callback`, metadata: {} }), signal: AbortSignal.timeout(15000) }).catch(() => null);
    const payload = res ? await res.json().catch(() => null) as { data?: { authority?: string } } | null : null;
    if (!res?.ok || !payload?.data?.authority) { await this.db.subscription.update({ where: { id: pending.id }, data: { status: 'FAILED' } }); throw new BadRequestException('درگاه پرداخت درخواست اشتراک را نپذیرفت.'); }
    await this.db.subscription.update({ where: { id: pending.id }, data: { authority: payload.data.authority } });
    this.audit.record({ action: 'subscription.checkout', entity: 'subscription', entityId: pending.id, shopId, meta: { planId, months, amount } });
    return { url: `https://www.zarinpal.com/pg/StartPay/${payload.data.authority}` };
  }
  async callback(authority: string, paymentStatus: string) {
    const pending = await this.db.subscription.findUnique({ where: { authority }, include: { plan: true } });
    if (!pending) return { ok: false, message: 'درخواست اشتراک پیدا نشد.' };
    if (pending.status === 'ACTIVE') return { ok: true, shopId: pending.shopId };
    if (paymentStatus !== 'OK') { await this.db.subscription.update({ where: { id: pending.id }, data: { status: 'CANCELLED' } }); return { ok: false, shopId: pending.shopId, message: 'پرداخت لغو شد.' }; }
    const res = await fetch(`${(process.env.ZARINPAL_API_BASE ?? 'https://api.zarinpal.com').replace(/\/+$/, '')}/pg/v4/payment/verify.json`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ merchant_id: process.env.ZARINPAL_MERCHANT_ID, amount: pending.amount * 10, authority }), signal: AbortSignal.timeout(15000) }).catch(() => null);
    const payload = res ? await res.json().catch(() => null) as { data?: { code?: number; ref_id?: number | string } } | null : null;
    if (!payload?.data || ![100, 101].includes(payload.data.code ?? -1)) { await this.db.subscription.update({ where: { id: pending.id }, data: { status: 'FAILED' } }); return { ok: false, shopId: pending.shopId, message: 'پرداخت تأیید نشد؛ اگر وجه کسر شده با پشتیبانی تماس بگیرید.' }; }
    const now = new Date();
    const previous = await this.db.subscription.findFirst({ where: { shopId: pending.shopId, status: 'ACTIVE', endsAt: { gt: now } }, orderBy: { endsAt: 'desc' } });
    const startsAt = previous?.endsAt ?? now; const endsAt = new Date(startsAt); endsAt.setMonth(endsAt.getMonth() + pending.months);
    await this.db.subscription.update({ where: { id: pending.id }, data: { status: 'ACTIVE', referenceId: String(payload.data.ref_id ?? ''), startsAt, endsAt } });
    this.audit.record({ action: 'subscription.paid', entity: 'subscription', entityId: pending.id, shopId: pending.shopId, meta: { refId: String(payload.data.ref_id ?? ''), endsAt: endsAt.toISOString() } });
    return { ok: true, shopId: pending.shopId };
  }
  async adminList() { return this.db.subscriptionPlan.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }); }
  async savePlan(input: { id?: string; name: string; monthlyPrice: number; instagramLimit: number; telegramLimit: number; active: boolean; sortOrder: number }, adminId: string) {
    if (!Number.isSafeInteger(input.monthlyPrice) || input.monthlyPrice < 0 || !Number.isInteger(input.instagramLimit) || input.instagramLimit < 0 || !Number.isInteger(input.telegramLimit) || input.telegramLimit < 0) throw new BadRequestException('قیمت و سقف اتصال نامعتبر است.');
    const data = { name: input.name.trim(), monthlyPrice: input.monthlyPrice, instagramLimit: input.instagramLimit, telegramLimit: input.telegramLimit, active: input.active, sortOrder: input.sortOrder };
    const plan = input.id ? await this.db.subscriptionPlan.update({ where: { id: input.id }, data }) : await this.db.subscriptionPlan.create({ data });
    this.audit.record({ action: input.id ? 'admin.plan_update' : 'admin.plan_create', entity: 'subscription_plan', entityId: plan.id, userId: adminId, meta: { name: plan.name, monthlyPrice: plan.monthlyPrice, active: plan.active } });
    return plan;
  }
}
