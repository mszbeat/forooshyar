import { ConflictException, Injectable, Logger, NotFoundException, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma, PrismaClient } from '@prisma/client';
import { AiService } from '../ai/ai.service';
import { hashPassword, verifyPassword } from '../auth/password';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../logging/audit.service';
import { readTelegramConfig, TelegramClient } from '../telegram/telegram.client';
import { SettingsService } from './settings.service';
import { databaseUrl } from '../config';
import { listModels } from './model-catalog';

export type AdminIdentity = { id: string; email: string; name: string };

const DEFAULT_ADMIN_EMAIL = 'admin@forooshyar.local';

/**
 * منطق پنل ادمین: ورود، نمای کلی پلتفرم، و آزمون‌های اتصال.
 *
 * حساب ادمین عمداً از `User` (فروشنده) جدا است: ادمین نه فروشگاه دارد و نه
 * محصول؛ اگر روی همان جدول بود، هر کوئری «فروشگاه من» می‌توانست به بن‌بست
 * بخورد و مرز دسترسی دو نقش به هم می‌ریخت.
 */
@Injectable()
export class AdminService implements OnModuleInit {
  private readonly logger = new Logger('Admin');

  constructor(
    private readonly db: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
    private readonly ai: AiService,
  ) {}

  /**
   * ساخت حساب ادمین در اولین اجرا.
   *
   * رمز **فقط** از `ADMIN_PASSWORD` خوانده می‌شود؛ هیچ رمز پیش‌فرضی در کد نیست
   * (رمز ثابت در مخزن یعنی هر نصب تازه با همان رمز باز می‌شود). اگر متغیر خالی
   * باشد حساب ساخته نمی‌شود و در لاگ توضیح داده می‌شود. رمز فقط به‌صورت هش
   * ذخیره می‌شود و لاگ هم متن رمز را نمی‌نویسد.
   */
  async onModuleInit() {
    const email = (process.env.ADMIN_EMAIL ?? DEFAULT_ADMIN_EMAIL).trim().toLowerCase();
    const password = (process.env.ADMIN_PASSWORD ?? '').trim();
    if (!password) {
      this.logger.warn('ADMIN_PASSWORD تنظیم نشده است؛ حساب ادمین ساخته نشد. برای ساخت، ADMIN_EMAIL و ADMIN_PASSWORD را بگذارید و سرویس را دوباره بالا بیاورید.');
      return;
    }
    try {
      const existing = await this.db.platformAdmin.findUnique({ where: { email } });
      if (existing) return;
      await this.db.platformAdmin.create({
        data: { email, passwordHash: await hashPassword(password), name: 'مدیر سامانه', mustChangePassword: true },
      });
      this.logger.log(`حساب ادمین ساخته شد (${email}). رمز را از پنل ادمین عوض کنید.`);
      this.audit.record({ action: 'admin.bootstrap', entity: 'admin', meta: { email } });
    } catch (error) {
      this.logger.warn(`ساخت حساب ادمین انجام نشد: ${error instanceof Error ? error.message : 'unknown'}`);
    }
  }

  async login(email: string, password: string): Promise<{ accessToken: string; expiresIn: number; admin: AdminIdentity; mustChangePassword: boolean }> {
    const normalized = email.trim().toLowerCase();
    const admin = await this.db.platformAdmin.findUnique({ where: { email: normalized } });
    if (!admin || !(await verifyPassword(password, admin.passwordHash))) {
      this.audit.record({ action: 'admin.login_failed', entity: 'admin', meta: { email: normalized, reason: admin ? 'bad_password' : 'unknown_email' } });
      throw new UnauthorizedException('ایمیل یا رمز ادمین درست نیست.');
    }
    await this.db.platformAdmin.update({ where: { id: admin.id }, data: { lastLoginAt: new Date() } });
    this.audit.record({ action: 'admin.login', entity: 'admin', entityId: admin.id, meta: { email: normalized } });
    const expiresIn = 8 * 3600;
    const accessToken = await this.jwt.signAsync({ sub: admin.id, kind: 'admin' }, { expiresIn });
    return {
      accessToken,
      expiresIn,
      admin: { id: admin.id, email: admin.email, name: admin.name },
      mustChangePassword: admin.mustChangePassword,
    };
  }

  async me(adminId: string): Promise<AdminIdentity & { mustChangePassword: boolean; lastLoginAt: string | null; createdAt: string }> {
    const admin = await this.db.platformAdmin.findUnique({ where: { id: adminId } });
    if (!admin) throw new UnauthorizedException();
    return {
      id: admin.id, email: admin.email, name: admin.name,
      mustChangePassword: admin.mustChangePassword,
      lastLoginAt: admin.lastLoginAt?.toISOString() ?? null,
      createdAt: admin.createdAt.toISOString(),
    };
  }

  async changePassword(adminId: string, current: string, next: string) {
    const admin = await this.db.platformAdmin.findUnique({ where: { id: adminId } });
    if (!admin || !(await verifyPassword(current, admin.passwordHash))) {
      throw new UnauthorizedException('رمز فعلی درست نیست.');
    }
    await this.db.platformAdmin.update({ where: { id: adminId }, data: { passwordHash: await hashPassword(next), mustChangePassword: false } });
    this.audit.record({ action: 'admin.password_change', entity: 'admin', entityId: adminId });
    return { ok: true };
  }

  /**
   * پیام کاربرپسند برای یک بخش خطادار نمای کلی.
   *
   * هرگز متن خام Prisma/کانکتور/SQL به UI نمی‌رود (نشتی اطلاعات داخلی و
   * تجربه‌ی بد برای ادمین). فقط کد خطای Prisma (مثل P2022 = ستون وجود
   * ندارد، یعنی مهاجرت اجرا نشده) برگردانده می‌شود تا ادمین بفهمد باید
   * مهاجرت را اجرا کند؛ جزئیات کامل فقط در لاگ سرور ثبت می‌شود.
   */
  private static describe(error: unknown): string {
    const err = error as { code?: string; message?: string } | null;
    const code = err?.code ?? '';
    const raw = err?.message ?? '';
    if (code === 'P2022' || /does not exist/i.test(raw)) {
      return 'ستون دیتابیس وجود ندارد؛ مهاجرت‌ها را اجرا کنید (prisma migrate deploy).';
    }
    if (/max clients|EMAXCONNSESSION|too many clients|connection/i.test(raw)) {
      return 'اتصال دیتابیس موقتاً پر است؛ چند ثانیه بعد دوباره تلاش کنید.';
    }
    if (code.startsWith('P1')) {
      return 'دیتابیس در دسترس نیست؛ وضعیت اتصال را بررسی کنید.';
    }
    return 'بخشی از آمار موقتاً در دسترس نیست.';
  }

  /**
   * اجرای یک کوئری با تلاش مجدد برای خطاهای گذرا (پر شدن pooler، قطع
   * موقت اتصال). حداکثر ۲ تلاش با وقفه‌ی کوتاه؛ خطای قطعی بی‌درنگ برمی‌گردد.
   */
  private async withRetry<T>(scope: string, run: () => Promise<T>): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await run();
      } catch (error) {
        lastError = error;
        const raw = (error as { message?: string })?.message ?? '';
        const transient = /max clients|EMAXCONNSESSION|too many clients|connection|timeout|ECONNRESET/i.test(raw);
        if (!transient || attempt === 1) throw error;
        this.logger.warn(`overview:${scope} transient error, retrying (${attempt + 1}/2)`);
        await new Promise(resolve => setTimeout(resolve, 250));
      }
    }
    throw lastError;
  }

  /** کش کوتاه‌مدت نمای کلی (۳۰ ثانیه) تا رفرش‌های پی‌درپی pooler را نترکانند. */
  private overviewCache: { at: number; data: Awaited<ReturnType<AdminService['buildOverview']>> } | null = null;

  /**
   * هر بخش از نمای کلی جدا اجرا می‌شود.
   *
   * قبلاً یک `Promise.all` بود: اگر یکی از پرس‌وجوها روی دیتابیس مقصد خطا
   * می‌داد (مثلاً ستونی که مهاجرتش اجرا نشده)، کل صفحه به «خطای غیرمنتظره‌ای در
   * سرور رخ داد» تبدیل می‌شد و هیچ سرنخی هم باقی نمی‌ماند. حالا هر بخش مستقل
   * است: بقیه‌ی نمای کلی می‌آید، بخش خطادار با دلیلش در `problems` گزارش
   * می‌شود و در لاگ سرور با استک ثبت می‌شود.
   */
  private async guard<T>(
    scope: string,
    problems: { scope: string; message: string }[],
    run: () => Promise<T>,
    fallback: T,
  ): Promise<T> {
    try {
      return await this.withRetry(scope, run);
    } catch (error) {
      const message = AdminService.describe(error);
      problems.push({ scope, message });
      // جزئیات کامل فقط در لاگ سرور؛ UI فقط پیام فارسی می‌بیند.
      this.logger.error(`overview:${scope} failed → ${(error as Error)?.message ?? 'unknown'}\n${(error as Error)?.stack ?? ''}`);
      return fallback;
    }
  }

  /** یک نگاه کلی: حجم داده، وضعیت سرویس‌ها، و آخرین رویدادهای گردش. */
  async overview() {
    // کش ۳۰ ثانیه‌ای: رفرش‌های پی‌درپی (و realtime) نباید هر بار ۱۲ کوئری
    // به pooler بزنند. نتیجه‌ی کش‌شده همان آبجکت قبلی است.
    const now = Date.now();
    if (this.overviewCache && now - this.overviewCache.at < 30_000) {
      return this.overviewCache.data;
    }
    const data = await this.buildOverview();
    this.overviewCache = { at: now, data };
    return data;
  }

  private async buildOverview() {
    const problems: { scope: string; message: string }[] = [];
    // کوئری‌ها ترتیبی و در دسته‌های کوچک اجرا می‌شوند، نه یک Promise.all
    // انفجاری: روی pooler با سقف ۱۵ اتصال، ۱۲ کوئری موازی + نمونه‌ی دوم
    // سرویس (دیپلوی zero-downtime) = EMAXCONNSESSION.
    const shops = await this.guard('counts.shops', problems, () => this.db.shop.count(), 0);
    const users = await this.guard('counts.users', problems, () => this.db.user.count(), 0);
    const products = await this.guard('counts.products', problems, () => this.db.product.count(), 0);
    const variants = await this.guard('counts.variants', problems, () => this.db.variant.count(), 0);
    const orders = await this.guard('counts.orders', problems, () => this.db.order.count(), 0);
    const messages = await this.guard('counts.messages', problems, () => this.db.chatMessage.count(), 0);
    const conversations = await this.guard('counts.conversations', problems, () => this.db.telegramConversation.count(), 0);
    const waiting = await this.guard('counts.waiting', problems, () => this.db.stockAlert.count({ where: { notifiedAt: null } }), 0);
    const ordersByStatus = await this.guard(
      'orders.byStatus', problems,
      () => this.db.order.groupBy({ by: ['status'], _count: { _all: true } }),
      [] as { status: string; _count: { _all: number } }[],
    );
    const recentAudit = await this.guard(
      'audit.recent', problems,
      () => this.db.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 12 }),
      [] as Awaited<ReturnType<typeof this.db.auditLog.findMany>>,
    );
    const recentShops = await this.guard(
      'shops.recent', problems,
      () => this.db.shop.findMany({
        orderBy: { createdAt: 'desc' },
        take: 6,
        select: {
          id: true, name: true, createdAt: true,
          owner: { select: { email: true } },
          _count: { select: { products: true, orders: true } },
          channel: { select: { active: true, botUsername: true, ownerChat: true } },
        },
      }),
      [] as Awaited<ReturnType<typeof this.db.shop.findMany<{
        select: {
          id: true; name: true; createdAt: true;
          owner: { select: { email: true } };
          _count: { select: { products: true; orders: true } };
          channel: { select: { active: true; botUsername: true; ownerChat: true } };
        };
      }>>>,
    );
    const db = await this.guard('services.database', problems, () => this.databaseInfo(), null);

    const ai = this.ai.status();
    const telegramConfig = readTelegramConfig();
    // مقدار را همین‌جا await می‌کنیم؛ اگر Promise را داخل آبجکت پاسخ بگذاریم،
    // JSON آن را `{}` می‌سازد و پنل فهرست کلیدهای نیازمند ری‌استارت را از دست
    // می‌دهد (باگی که بعد از بخش‌بندی کردن overview پیش آمد).
    const restartRequired = await this.guard(
      'settings.restartRequired', problems,
      async () => this.settings.restartRequired(),
      [] as string[],
    );

    return {
      counts: { shops, users, products, variants, orders, messages, conversations, waiting },
      ordersByStatus: ordersByStatus.map(row => ({ status: row.status, count: row._count._all })),
      services: {
        ai: { ...ai, latencyMs: null as number | null },
        telegram: {
          configured: Boolean(telegramConfig.token),
          webhookSecretSet: Boolean((process.env.TELEGRAM_WEBHOOK_SECRET ?? '').trim()),
          publicUrl: (process.env.PUBLIC_API_URL ?? '').trim(),
          baseUrl: telegramConfig.baseUrl,
        },
        payment: {
          provider: (process.env.ZARINPAL_MERCHANT_ID ?? '').trim() ? 'zarinpal' : 'sandbox',
        },
        cache: { enabled: (process.env.CACHE_ENABLED ?? '').trim() === 'true' },
        database: db,
      },
      runtime: {
        uptimeSec: Math.round(process.uptime()),
        node: process.version,
        memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
        env: process.env.NODE_ENV ?? 'development',
      },
      restartRequired,
      problems,
      recentShops: recentShops.map(shop => ({
        id: shop.id,
        name: shop.name,
        owner: shop.owner.email,
        createdAt: shop.createdAt.toISOString(),
        products: shop._count.products,
        orders: shop._count.orders,
        bot: shop.channel?.active ? (shop.channel.botUsername || 'فعال') : null,
        ownerLinked: Boolean(shop.channel?.ownerChat),
      })),
      recentAudit: recentAudit.map(row => ({
        id: row.id, action: row.action, success: row.success, statusCode: row.statusCode,
        durationMs: row.durationMs, path: row.path, entity: row.entity, entityId: row.entityId,
        at: row.createdAt.toISOString(),
        meta: row.meta as Record<string, unknown> | null,
      })),
    };
  }

  /** فهرست فروشگاه‌ها برای مدیریت ادمین. */
  listShops() {
    return this.db.shop.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, name: true, active: true, createdAt: true,
        owner: { select: { email: true } },
        _count: { select: { products: true, orders: true } },
      },
    }).then(rows => rows.map(shop => ({
      id: shop.id, name: shop.name, email: shop.owner.email, active: shop.active,
      createdAt: shop.createdAt.toISOString(), products: shop._count.products, orders: shop._count.orders,
    })));
  }

  /** ایجاد مالک و فروشگاه در یک تراکنش؛ رمز هرگز در لاگ ثبت نمی‌شود. */
  async createShop(input: { name: string; email: string; password: string }, admin: AdminIdentity) {
    const email = input.email.trim().toLowerCase();
    try {
      const user = await this.db.user.create({
        data: {
          email, passwordHash: await hashPassword(input.password),
          shop: { create: { name: input.name.trim(), trialStartedAt: new Date(), trialEndsAt: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000) } },
        },
        include: { shop: true },
      });
      const shop = user.shop!;
      this.audit.record({ action: 'admin.shop_create', entity: 'shop', entityId: shop.id, meta: { email, name: shop.name, adminId: admin.id } });
      return { id: shop.id, name: shop.name, email, active: shop.active, createdAt: shop.createdAt.toISOString(), products: 0, orders: 0 };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('این ایمیل قبلاً برای حساب دیگری ثبت شده است.');
      }
      throw error;
    }
  }

  /** ویرایش اطلاعات مالک/فروشگاه، وضعیت فعال و در صورت نیاز رمز تازه. */
  async updateShop(id: string, input: { name?: string; email?: string; active?: boolean; password?: string }, admin: AdminIdentity) {
    const current = await this.db.shop.findUnique({ where: { id }, select: { id: true, ownerId: true } });
    if (!current) throw new NotFoundException('فروشگاه پیدا نشد.');
    const email = input.email?.trim().toLowerCase();
    try {
      await this.db.$transaction(async tx => {
        if (input.name !== undefined || input.active !== undefined) {
          await tx.shop.update({ where: { id }, data: {
            ...(input.name !== undefined ? { name: input.name.trim() } : {}),
            ...(input.active !== undefined ? { active: input.active } : {}),
          } });
        }
        if (email !== undefined || input.password) {
          await tx.user.update({ where: { id: current.ownerId }, data: {
            ...(email !== undefined ? { email } : {}),
            ...(input.password ? { passwordHash: await hashPassword(input.password) } : {}),
          } });
        }
      });
      this.audit.record({ action: input.active === undefined ? 'admin.shop_update' : 'admin.shop_status', entity: 'shop', entityId: id, meta: { email, active: input.active, adminId: admin.id } });
      return this.db.shop.findUniqueOrThrow({
        where: { id }, select: { id: true, name: true, active: true, createdAt: true, owner: { select: { email: true } }, _count: { select: { products: true, orders: true } } },
      }).then(shop => ({ id: shop.id, name: shop.name, email: shop.owner.email, active: shop.active, createdAt: shop.createdAt.toISOString(), products: shop._count.products, orders: shop._count.orders }));
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('این ایمیل قبلاً برای حساب دیگری ثبت شده است.');
      }
      throw error;
    }
  }

  /** حذف قطعی فروشگاه و داده‌های وابسته با تأیید صریح؛ رویداد ممیزی باقی می‌ماند. */
  async deleteShop(id: string, admin: AdminIdentity) {
    const shop = await this.db.shop.findUnique({ where: { id }, select: { id: true, name: true, ownerId: true } });
    if (!shop) throw new NotFoundException('فروشگاه پیدا نشد.');
    await this.db.$transaction(async tx => {
      await tx.stockAlert.deleteMany({ where: { shopId: id } });
      await tx.orderItem.deleteMany({ where: { shopId: id } });
      await tx.stockMovement.deleteMany({ where: { shopId: id } });
      await tx.stockOperation.deleteMany({ where: { shopId: id } });
      await tx.chatMessage.deleteMany({ where: { shopId: id } });
      await tx.order.deleteMany({ where: { shopId: id } });
      await tx.variant.deleteMany({ where: { shopId: id } });
      await tx.product.deleteMany({ where: { shopId: id } });
      await tx.channel.deleteMany({ where: { shopId: id } });
      await tx.telegramConversation.deleteMany({ where: { shopId: id } });
      await tx.shop.delete({ where: { id } });
      await tx.user.delete({ where: { id: shop.ownerId } });
    }, { timeout: 30_000 });
    this.audit.record({ action: 'admin.shop_delete', entity: 'shop', entityId: id, meta: { name: shop.name, adminId: admin.id } });
    return { ok: true };
  }

  /** وضعیت دیتابیس: نسخه، حجم، تأخیر و مهاجرت‌های اعمال‌شده. */
  async databaseInfo() {
    const started = Date.now();
    const [version] = await this.db.$queryRaw<{ version: string }[]>`SELECT version()`;
    const latencyMs = Date.now() - started;
    const [size] = await this.db.$queryRaw<{ size: string; tables: bigint }[]>`
      SELECT pg_size_pretty(pg_database_size(current_database())) AS size,
             (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public') AS tables
    `;
    const migrations = await this.db.$queryRaw<{ migration_name: string; finished_at: Date | null }[]>`
      SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY finished_at DESC NULLS LAST LIMIT 8
    `.catch(() => []);
    return {
      latencyMs,
      version: version?.version?.split(' ').slice(0, 2).join(' ') ?? 'unknown',
      size: size?.size ?? 'unknown',
      tables: Number(size?.tables ?? 0),
      migrations: migrations.map(row => ({
        name: row.migration_name,
        at: row.finished_at ? new Date(row.finished_at).toISOString() : null,
      })),
    };
  }

  /**
   * آزمون یک آدرس اتصالِ پیشنهادی، بدون دست‌زدن به اتصال جاری.
   *
   * ادمین می‌تواند پیش از ذخیره‌ی `DATABASE_URL` مطمئن شود که با آن آدرس واقعاً
   * می‌تواند وصل شود؛ کلاینت موقت بلافاصله بسته می‌شود.
   */
  async probeDatabase(url: string) {
    const requested = url.trim();
    const candidate = requested || this.settings.databaseUrl();
    // ورودی خالی یعنی آزمون اتصال واقعاً فعال (همان pool سرویس)، نه بازکردن pool تازه.
    // برای آدرس صریح نیز اگر دقیقاً همان env زمان اجرای Prisma باشد، pool مشترک را استفاده کن.
    // PrismaClient موقت برای هر probe در poolerهای محدود می‌توانست max clients بدهد.
    const usesCurrentPool = !requested || candidate === databaseUrl(process.env);
    const client = usesCurrentPool ? this.db : new PrismaClient({ datasources: { db: { url: candidate } }, log: [] });
    const started = Date.now();
    try {
      const [row] = await Promise.race([
        client.$queryRaw<{ version: string }[]>`SELECT version()`,
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('زمان انتظار تمام شد (۸ ثانیه).')), 8000)),
      ]);
      const latencyMs = Date.now() - started;
      const counts = await client.$queryRaw<{ products: bigint; shops: bigint }[]>`
        SELECT (SELECT count(*) FROM "Product") AS products, (SELECT count(*) FROM "Shop") AS shops
      `.catch(() => [{ products: 0n, shops: 0n }]);
      return {
        ok: true,
        latencyMs,
        version: row?.version?.split(' ').slice(0, 2).join(' ') ?? 'unknown',
        products: Number(counts[0]?.products ?? 0),
        shops: Number(counts[0]?.shops ?? 0),
      };
    } catch (error) {
      return { ok: false, latencyMs: Date.now() - started, error: error instanceof Error ? error.message.slice(0, 300) : 'خطای نامشخص' };
    } finally {
      if (!usesCurrentPool) await client.$disconnect().catch(() => undefined);
    }
  }

  /** آزمون اتصال مدل زبانی با تنظیمات فعلی. */
  async probeAi(overrides: { baseUrl?: string; model?: string; apiKey?: string } = {}) {
    const result = await this.ai.probe(overrides);
    this.audit.record({
      action: 'admin.ai_probe', entity: 'settings',
      meta: {
        ok: result.ok, model: result.model, provider: result.provider,
        latencyMs: result.latencyMs, draft: Object.keys(overrides).length > 0,
      },
    });
    return result;
  }

  /** فهرست مدل‌های درگاه؛ زنده از ارائه‌دهنده و با بازگشت به کاتالوگ. */
  async aiModels(input: { provider: string; baseUrl?: string; apiKey?: string; refresh?: boolean }) {
    const result = await listModels(input.provider, input);
    this.audit.record({
      action: 'admin.ai_models', entity: 'settings',
      meta: { provider: result.provider, live: result.live, count: result.models.length, refresh: Boolean(input.refresh) },
    });
    return result;
  }

  /** آزمون اتصال تلگرام: هویت بات + وضعیت webhook ثبت‌شده. */
  async probeTelegram() {
    const config = readTelegramConfig();
    const client = new TelegramClient(config);
    if (!client.configured) {
      return { ok: false, error: 'توکن بات تنظیم نشده است.', bot: null, webhook: null };
    }
    const [me, hook] = await Promise.all([client.getMe(), client.getWebhookInfo()]);
    return {
      ok: me.ok,
      error: me.ok ? null : (me.description ?? me.error),
      bot: me.ok ? { id: me.result.id, username: me.result.username ?? null } : null,
      webhook: hook.ok
        ? {
            url: hook.result.url ?? '',
            pending: hook.result.pending_update_count ?? 0,
            lastError: hook.result.last_error_message ?? null,
          }
        : null,
    };
  }

  /** خروج کنترل‌شده؛ روی Render خودِ پلتفرم سرویس را دوباره بالا می‌آورد. */
  restart(actor: AdminIdentity): { ok: true; restarting: true } {
    this.audit.record({ action: 'admin.restart', entity: 'system', meta: { actor: actor.email } });
    this.logger.warn(`ری‌استارت سرویس به درخواست ${actor.email}`);
    setTimeout(() => process.exit(0), 400);
    return { ok: true, restarting: true };
  }
}
