import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../logging/audit.service';
import { endsAtFrom, instagramAddonMonthlyPrice, quotePrice } from './pricing';

/**
 * پلن‌های پیش‌فرض (مقادیر نمونه — ادمین در `/admin/plans` قیمت نهایی را تنظیم می‌کند).
 * هر پیج اینستاگرام اضافه هزینه‌ی واقعی دارد و جداگانه قیمت‌گذاری می‌شود؛
 * تلگرام و بله در سقف پلن گنجانده شده‌اند.
 */
const SEED_PLANS = [
  {
    slug: 'free',
    name: 'رایگان',
    tagline: 'برای شروع و آشنایی با فروش‌یار',
    description: 'برای فروشگاهی که تازه می‌خواهد پاسخ خودکار را امتحان کند.',
    features: [
      'پاسخ خودکار از کاتالوگ زنده',
      '۱ اتصال اینستاگرام + ۱ اتصال تلگرام',
      'سفارش‌گیری در همان گفتگو',
      '۱۰۰ پاسخ هوش مصنوعی در ماه',
    ],
    monthlyPrice: 0,
    listMonthlyPrice: 0,
    instagramLimit: 1,
    telegramLimit: 1,
    monthlyMessageLimit: 100,
    dailyMessageLimit: 20,
    productLimit: 50,
    automationLimit: 1,
    smsLimit: 0,
    isPopular: false,
    sortOrder: 0,
  },
  {
    slug: 'pro',
    name: 'پرو',
    tagline: 'برای فروشگاهی که هر روز پیام می‌گیرد',
    description: 'ظرفیت بیشتر برای فروشگاهی که دایرکت، کانال اصلی فروش آن است.',
    features: [
      'همه‌ی امکانات رایگان',
      '۳ پیج اینستاگرام + ۳ بات تلگرام',
      '۱٬۰۰۰ پاسخ هوش مصنوعی در ماه',
      'لحن پاسخ قابل تنظیم + پیش‌نمایش زنده',
      'اعلان موجودی کم و گزارش فروش',
    ],
    monthlyPrice: 490000,
    listMonthlyPrice: 690000,
    instagramLimit: 3,
    telegramLimit: 3,
    monthlyMessageLimit: 1000,
    dailyMessageLimit: 100,
    productLimit: 500,
    automationLimit: 5,
    smsLimit: 100,
    isPopular: true,
    sortOrder: 1,
  },
  {
    slug: 'ultra',
    name: 'اولترا',
    tagline: 'برای فروشگاه پرمخاطب با چند پیج',
    description: 'سقف بالا برای کسب‌وکارهایی که دایرکت، کانال اصلی فروش آن‌هاست.',
    features: [
      'همه‌ی امکانات پرو',
      '۱۰ پیج اینستاگرام + ۱۰ بات تلگرام',
      '۵٬۰۰۰ پاسخ هوش مصنوعی در ماه',
      'اتوماسیون کامنت به دایرکت',
      'پشتیبانی اولویت‌دار',
    ],
    monthlyPrice: 990000,
    listMonthlyPrice: 1390000,
    instagramLimit: 10,
    telegramLimit: 10,
    monthlyMessageLimit: 5000,
    dailyMessageLimit: 300,
    productLimit: 2000,
    automationLimit: 20,
    smsLimit: 500,
    isPopular: false,
    sortOrder: 2,
  },
  {
    slug: 'max',
    name: 'مکس',
    tagline: 'برای تیم فروش با حجم بالا',
    description: 'بیشترین ظرفیت برای فروشگاه‌های بزرگ و چندفروشگاهی.',
    features: [
      'همه‌ی امکانات اولترا',
      'پیج و بات نامحدود',
      '۲۰٬۰۰۰ پاسخ هوش مصنوعی در ماه',
      'پیامک اطلاع‌رسانی فروشنده',
      'مدیر حساب اختصاصی',
    ],
    monthlyPrice: 2490000,
    listMonthlyPrice: 3490000,
    instagramLimit: 0,
    telegramLimit: 0,
    monthlyMessageLimit: 20000,
    dailyMessageLimit: 1000,
    productLimit: 0,
    automationLimit: 0,
    smsLimit: 2000,
    isPopular: false,
    sortOrder: 3,
  },
  {
    slug: 'custom',
    name: 'اختصاصی',
    tagline: 'تماس بگیرید',
    description: 'برای نیازهای خاص و سازمانی؛ با ما در تماس باشید.',
    features: [
      'همه‌ی امکانات مکس',
      'سقف‌های سفارشی',
      'پشتیبانی اختصاصی',
    ],
    monthlyPrice: 0,
    listMonthlyPrice: 0,
    instagramLimit: 0,
    telegramLimit: 0,
    monthlyMessageLimit: 0,
    dailyMessageLimit: 0,
    productLimit: 0,
    automationLimit: 0,
    smsLimit: 0,
    isPopular: false,
    sortOrder: 4,
  },
];

function toPublicPlan(plan: {
  id: string; slug: string; name: string; tagline: string; description: string;
  features: unknown; monthlyPrice: number; listMonthlyPrice: number;
  instagramLimit: number; telegramLimit: number; monthlyMessageLimit: number;
  dailyMessageLimit?: number; productLimit: number; automationLimit?: number; smsLimit?: number;
  isPopular: boolean; sortOrder: number;
}) {
  return {
    id: plan.id,
    slug: plan.slug,
    name: plan.name,
    tagline: plan.tagline,
    description: plan.description,
    features: Array.isArray(plan.features) ? plan.features.filter((f): f is string => typeof f === 'string') : [],
    monthlyPrice: plan.monthlyPrice,
    listMonthlyPrice: plan.listMonthlyPrice,
    instagramLimit: plan.instagramLimit,
    telegramLimit: plan.telegramLimit,
    monthlyMessageLimit: plan.monthlyMessageLimit,
    dailyMessageLimit: plan.dailyMessageLimit ?? 0,
    productLimit: plan.productLimit,
    automationLimit: plan.automationLimit ?? 0,
    smsLimit: plan.smsLimit ?? 0,
    isPopular: plan.isPopular,
    sortOrder: plan.sortOrder,
    extraInstagramPrice: instagramAddonMonthlyPrice(),
  };
}

@Injectable()
export class SubscriptionsService implements OnModuleInit {
  constructor(private readonly db: PrismaService, private readonly audit: AuditService) {}

  async onModuleInit() {
    // seed idempotent: پلن‌های جدید ساخته و پلن‌های موجود به‌روزرسانی می‌شوند.
    for (const plan of SEED_PLANS) {
      const existing = await this.db.subscriptionPlan.findFirst({ where: { slug: plan.slug } }).catch(() => null);
      if (!existing) {
        await this.db.subscriptionPlan.create({ data: { ...plan, active: true } }).catch(() => undefined);
      } else {
        await this.db.subscriptionPlan.update({
          where: { id: existing.id },
          data: { name: plan.name, tagline: plan.tagline, description: plan.description, features: plan.features as unknown as import('@prisma/client').Prisma.InputJsonValue, monthlyPrice: plan.monthlyPrice, listMonthlyPrice: plan.listMonthlyPrice, instagramLimit: plan.instagramLimit, telegramLimit: plan.telegramLimit, monthlyMessageLimit: plan.monthlyMessageLimit, dailyMessageLimit: plan.dailyMessageLimit, productLimit: plan.productLimit, automationLimit: plan.automationLimit, smsLimit: plan.smsLimit, isPopular: plan.isPopular, sortOrder: plan.sortOrder },
        }).catch(() => undefined);
      }
    }
    // پلن‌های قدیمی (basic/business) غیرفعال می‌شوند تا فقط ۵ سطح نمایش داده شود.
    await this.db.subscriptionPlan.updateMany({ where: { slug: { in: ['basic', 'business'] } }, data: { active: false } }).catch(() => undefined);
  }

  /** مصرف پاسخ هوش مصنوعی این ماه/امروز (از پیام‌های بات) در برابر سقف پلن. */
  async aiUsage(shopId: string) {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const [usedMonth, usedDay, current] = await Promise.all([
      this.db.chatMessage.count({ where: { shopId, author: 'bot', createdAt: { gte: monthStart } } }),
      this.db.chatMessage.count({ where: { shopId, author: 'bot', createdAt: { gte: dayStart } } }),
      this.db.subscription.findFirst({ where: { shopId, status: 'ACTIVE', endsAt: { gt: now } }, include: { plan: true }, orderBy: { endsAt: 'desc' } }),
    ]);
    const plan = current?.plan ?? null;
    const monthlyLimit = plan?.monthlyMessageLimit ?? 0;
    const dailyLimit = plan?.dailyMessageLimit ?? 0;
    return {
      usedMonth, usedDay,
      monthlyLimit, dailyLimit,
      planName: plan?.name ?? 'رایگان',
      exceeded: (monthlyLimit > 0 && usedMonth >= monthlyLimit) || (dailyLimit > 0 && usedDay >= dailyLimit),
    };
  }

  /** آیا سقف پاسخ هوش مصنوعی پر شده؟ (برای fallback به پاسخ قالبی) */
  async aiLimitExceeded(shopId: string): Promise<boolean> {
    const usage = await this.aiUsage(shopId).catch(() => null);
    return usage?.exceeded ?? false;
  }

  async plans() {
    const rows = await this.db.subscriptionPlan.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: 'asc' }, { monthlyPrice: 'asc' }],
    });
    return rows.map(toPublicPlan);
  }

  async planBySlug(slug: string) {
    const plan = await this.db.subscriptionPlan.findFirst({ where: { slug, active: true } });
    if (!plan) throw new NotFoundException('این پلن پیدا نشد.');
    return toPublicPlan(plan);
  }

  /** قیمت قطعی سمت سرور؛ کلاینت فقط نمایش می‌دهد. */
  async quote(planId: string, months: number, extraInstagram: number, discountCode?: string) {
    const plan = await this.db.subscriptionPlan.findFirst({ where: { id: planId, active: true } });
    if (!plan) throw new NotFoundException('پلن در دسترس نیست.');
    if (plan.monthlyPrice <= 0) throw new BadRequestException('قیمت این پلن هنوز تنظیم نشده است.');
    const code = (discountCode ?? '').trim().toUpperCase();
    let percent = 0;
    if (code) {
      const found = await this.db.discountCode.findUnique({ where: { code } });
      if (!found || !found.active) throw new BadRequestException('کد تخفیف معتبر نیست.');
      percent = found.percent;
    }
    const result = quotePrice({ monthlyPrice: plan.monthlyPrice, months, extraInstagram, discountPercent: percent });
    const now = new Date();
    return {
      ...result,
      months: Math.min(18, Math.max(1, Math.floor(months) || 1)),
      extraInstagram: Math.max(0, Math.floor(extraInstagram) || 0),
      addonUnitPrice: instagramAddonMonthlyPrice(),
      discountCode: code || null,
      endsAt: endsAtFrom(now, Math.min(18, Math.max(1, Math.floor(months) || 1))).toISOString(),
    };
  }

  async status(shopId: string) {
    const [shop, current] = await Promise.all([
      this.db.shop.findUniqueOrThrow({ where: { id: shopId }, select: { trialStartedAt: true, trialEndsAt: true } }),
      this.db.subscription.findFirst({ where: { shopId, status: 'ACTIVE', endsAt: { gt: new Date() } }, include: { plan: true }, orderBy: { endsAt: 'desc' } }),
    ]);
    const trialActive = Boolean(shop.trialEndsAt && shop.trialEndsAt > new Date());
    return {
      active: Boolean(current) || trialActive,
      mode: current ? 'paid' : trialActive ? 'trial' : 'expired',
      trialStartedAt: shop.trialStartedAt?.toISOString() ?? null,
      trialEndsAt: shop.trialEndsAt?.toISOString() ?? null,
      subscription: current ? { planName: current.plan.name, startsAt: current.startsAt?.toISOString(), endsAt: current.endsAt?.toISOString(), months: current.months } : null,
      aiUsage: await this.aiUsage(shopId).catch(() => null),
      plans: await this.plans(),
    };
  }

  async assertCanConnect(shopId: string) {
    if (!(await this.status(shopId)).active) throw new BadRequestException('دورهٔ آزمایشی تمام شده است. برای اتصال کانال، اشتراک را فعال کنید. داده‌های فروشگاه محفوظ است.');
  }

  /**
   * شروع خرید اشتراک.
   * درگاه واقعی (زرین‌پال) اگر مرچنت‌آیدی ست باشد؛ وگرنه درگاه آزمایشی داخلی
   * که همان جریان را بدون جابه‌جایی پول قابل تست می‌کند.
   */
  async checkout(shopId: string, planId: string, months: number, extraInstagram: number, discountCode: string, publicUrl: string) {
    if (!Number.isInteger(months) || months < 1 || months > 18) throw new BadRequestException('مدت اشتراک باید بین ۱ تا ۱۸ ماه باشد.');
    if (!Number.isInteger(extraInstagram) || extraInstagram < 0 || extraInstagram > 50) throw new BadRequestException('تعداد پیج اضافه نامعتبر است.');
    const plan = await this.db.subscriptionPlan.findFirst({ where: { id: planId, active: true } });
    if (!plan) throw new NotFoundException('پلن در دسترس نیست.');
    if (plan.monthlyPrice <= 0) throw new BadRequestException('قیمت این پلن هنوز تنظیم نشده است.');
    const code = (discountCode ?? '').trim().toUpperCase();
    let percent = 0;
    if (code) {
      const found = await this.db.discountCode.findUnique({ where: { code } });
      if (!found || !found.active) throw new BadRequestException('کد تخفیف معتبر نیست.');
      percent = found.percent;
    }
    const priced = quotePrice({ monthlyPrice: plan.monthlyPrice, months, extraInstagram, discountPercent: percent });
    const amount = priced.total;
    if (!Number.isSafeInteger(amount) || amount <= 0) throw new BadRequestException('مبلغ اشتراک معتبر نیست.');

    const pending = await this.db.subscription.create({
      data: { shopId, planId, months, amount, extraInstagram, discountCode: code, status: 'PENDING' },
    });

    const merchantId = (process.env.ZARINPAL_MERCHANT_ID ?? '').trim();
    if (!merchantId) {
      // درگاه آزمایشی: صفحه‌ی تأیید روی همین سرویس.
      const authority = `sbx_${randomBytes(12).toString('hex')}`;
      await this.db.subscription.update({ where: { id: pending.id }, data: { authority } });
      this.audit.record({ action: 'subscription.checkout_sandbox', entity: 'subscription', entityId: pending.id, shopId, meta: { planId, months, amount, extraInstagram } });
      return { url: `${publicUrl}/subscriptions/sandbox/${authority}`, provider: 'sandbox' as const };
    }

    if (!publicUrl.startsWith('https://')) throw new BadRequestException('PUBLIC_API_URL با HTTPS باید تنظیم شود.');
    const res = await fetch(`${(process.env.ZARINPAL_API_BASE ?? 'https://api.zarinpal.com').replace(/\/+$/, '')}/pg/v4/payment/request.json`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ merchant_id: merchantId, amount: amount * 10, description: `اشتراک ${plan.name} - ${months} ماه`, callback_url: `${publicUrl}/subscriptions/callback`, metadata: {} }),
      signal: AbortSignal.timeout(15000),
    }).catch(() => null);
    const payload = res ? await res.json().catch(() => null) as { data?: { authority?: string } } | null : null;
    if (!res?.ok || !payload?.data?.authority) {
      await this.db.subscription.update({ where: { id: pending.id }, data: { status: 'FAILED' } });
      throw new BadRequestException('درگاه پرداخت درخواست اشتراک را نپذیرفت.');
    }
    await this.db.subscription.update({ where: { id: pending.id }, data: { authority: payload.data.authority } });
    this.audit.record({ action: 'subscription.checkout', entity: 'subscription', entityId: pending.id, shopId, meta: { planId, months, amount } });
    return { url: `https://www.zarinpal.com/pg/StartPay/${payload.data.authority}`, provider: 'zarinpal' as const };
  }

  /** تأیید درگاه آزمایشی (صفحه‌ی sandbox). */
  async confirmSandbox(authority: string, ok: boolean) {
    const pending = await this.db.subscription.findUnique({ where: { authority }, include: { plan: true } });
    if (!pending) return { ok: false as const, message: 'درخواست اشتراک پیدا نشد.' };
    if (pending.status === 'ACTIVE') return { ok: true as const, shopId: pending.shopId };
    if (!ok) {
      await this.db.subscription.update({ where: { id: pending.id }, data: { status: 'CANCELLED' } });
      return { ok: false as const, shopId: pending.shopId, message: 'پرداخت لغو شد.' };
    }
    return this.activate(pending, `SBX-${Date.now().toString(36).toUpperCase()}`);
  }

  async callback(authority: string, paymentStatus: string) {
    const pending = await this.db.subscription.findUnique({ where: { authority }, include: { plan: true } });
    if (!pending) return { ok: false, message: 'درخواست اشتراک پیدا نشد.' };
    if (pending.status === 'ACTIVE') return { ok: true, shopId: pending.shopId };
    if (paymentStatus !== 'OK') {
      await this.db.subscription.update({ where: { id: pending.id }, data: { status: 'CANCELLED' } });
      return { ok: false, shopId: pending.shopId, message: 'پرداخت لغو شد.' };
    }
    const merchantId = (process.env.ZARINPAL_MERCHANT_ID ?? '').trim();
    const res = await fetch(`${(process.env.ZARINPAL_API_BASE ?? 'https://api.zarinpal.com').replace(/\/+$/, '')}/pg/v4/payment/verify.json`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ merchant_id: merchantId, amount: pending.amount * 10, authority }),
      signal: AbortSignal.timeout(15000),
    }).catch(() => null);
    const payload = res ? await res.json().catch(() => null) as { data?: { code?: number; ref_id?: number | string } } | null : null;
    if (!payload?.data || ![100, 101].includes(payload.data.code ?? -1)) {
      await this.db.subscription.update({ where: { id: pending.id }, data: { status: 'FAILED' } });
      return { ok: false, shopId: pending.shopId, message: 'پرداخت تأیید نشد؛ اگر وجه کسر شده با پشتیبانی تماس بگیرید.' };
    }
    return this.activate(pending, String(payload.data.ref_id ?? ''));
  }

  private async activate(pending: { id: string; shopId: string; months: number; plan: { name: string } }, refId: string) {
    const now = new Date();
    const previous = await this.db.subscription.findFirst({ where: { shopId: pending.shopId, status: 'ACTIVE', endsAt: { gt: now } }, orderBy: { endsAt: 'desc' } });
    const startsAt = previous?.endsAt ?? now;
    const endsAt = endsAtFrom(startsAt, pending.months);
    await this.db.subscription.update({ where: { id: pending.id }, data: { status: 'ACTIVE', referenceId: refId, startsAt, endsAt } });
    this.audit.record({ action: 'subscription.paid', entity: 'subscription', entityId: pending.id, shopId: pending.shopId, meta: { refId, endsAt: endsAt.toISOString() } });
    return { ok: true as const, shopId: pending.shopId };
  }

  /** خلاصه‌ی یک خرید در انتظار برای صفحه‌ی درگاه آزمایشی. */
  async sandboxSummary(authority: string) {
    const pending = await this.db.subscription.findUnique({ where: { authority }, include: { plan: true } });
    if (!pending) return null;
    return {
      id: pending.id,
      planName: pending.plan.name,
      months: pending.months,
      extraInstagram: pending.extraInstagram,
      amount: pending.amount,
      status: pending.status,
    };
  }

  async adminList() {
    return this.db.subscriptionPlan.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
  }

  async savePlan(input: {
    id?: string; slug?: string; name: string; tagline?: string; description?: string;
    features?: string[]; monthlyPrice: number; listMonthlyPrice?: number;
    instagramLimit: number; telegramLimit: number; monthlyMessageLimit?: number;
    productLimit?: number; isPopular?: boolean; active: boolean; sortOrder: number;
  }, adminId: string) {
    if (!Number.isSafeInteger(input.monthlyPrice) || input.monthlyPrice < 0
      || !Number.isInteger(input.instagramLimit) || input.instagramLimit < 0
      || !Number.isInteger(input.telegramLimit) || input.telegramLimit < 0) {
      throw new BadRequestException('قیمت و سقف اتصال نامعتبر است.');
    }
    const slug = (input.slug ?? '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    if (!slug) throw new BadRequestException('شناسه‌ی پلن (slug) لازم است.');
    const data = {
      slug,
      name: input.name.trim(),
      tagline: (input.tagline ?? '').trim(),
      description: (input.description ?? '').trim(),
      features: (input.features ?? []).map(f => String(f).trim()).filter(Boolean).slice(0, 20),
      monthlyPrice: input.monthlyPrice,
      listMonthlyPrice: Math.max(0, Math.floor(input.listMonthlyPrice ?? 0) || 0),
      instagramLimit: input.instagramLimit,
      telegramLimit: input.telegramLimit,
      monthlyMessageLimit: Math.max(0, Math.floor(input.monthlyMessageLimit ?? 0) || 0),
      productLimit: Math.max(0, Math.floor(input.productLimit ?? 0) || 0),
      isPopular: Boolean(input.isPopular),
      active: input.active,
      sortOrder: input.sortOrder,
    };
    const plan = input.id
      ? await this.db.subscriptionPlan.update({ where: { id: input.id }, data })
      : await this.db.subscriptionPlan.create({ data });
    this.audit.record({ action: input.id ? 'admin.plan_update' : 'admin.plan_create', entity: 'subscription_plan', entityId: plan.id, userId: adminId, meta: { name: plan.name, monthlyPrice: plan.monthlyPrice, active: plan.active } });
    return plan;
  }
}
