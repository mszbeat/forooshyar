import { Injectable, Logger, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient } from '@prisma/client';
import { AiService } from '../ai/ai.service';
import { hashPassword, verifyPassword } from '../auth/password';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../logging/audit.service';
import { readTelegramConfig, TelegramClient } from '../telegram/telegram.client';
import { SettingsService } from './settings.service';
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
        data: { email, passwordHash: await hashPassword(password), name: 'مدیر سامانه' },
      });
      this.logger.log(`حساب ادمین ساخته شد (${email}). رمز را از پنل ادمین عوض کنید.`);
      this.audit.record({ action: 'admin.bootstrap', entity: 'admin', meta: { email } });
    } catch (error) {
      this.logger.warn(`ساخت حساب ادمین انجام نشد: ${error instanceof Error ? error.message : 'unknown'}`);
    }
  }

  async login(email: string, password: string): Promise<{ accessToken: string; expiresIn: number; admin: AdminIdentity }> {
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
    };
  }

  async me(adminId: string): Promise<AdminIdentity & { lastLoginAt: string | null; createdAt: string }> {
    const admin = await this.db.platformAdmin.findUnique({ where: { id: adminId } });
    if (!admin) throw new UnauthorizedException();
    return {
      id: admin.id, email: admin.email, name: admin.name,
      lastLoginAt: admin.lastLoginAt?.toISOString() ?? null,
      createdAt: admin.createdAt.toISOString(),
    };
  }

  async changePassword(adminId: string, current: string, next: string) {
    const admin = await this.db.platformAdmin.findUnique({ where: { id: adminId } });
    if (!admin || !(await verifyPassword(current, admin.passwordHash))) {
      throw new UnauthorizedException('رمز فعلی درست نیست.');
    }
    await this.db.platformAdmin.update({ where: { id: adminId }, data: { passwordHash: await hashPassword(next) } });
    this.audit.record({ action: 'admin.password_change', entity: 'admin', entityId: adminId });
    return { ok: true };
  }

  /** یک نگاه کلی: حجم داده، وضعیت سرویس‌ها، و آخرین رویدادهای گردش. */
  async overview() {
    const [
      shops, users, products, variants, orders, messages, conversations, waiting,
      ordersByStatus, recentAudit, recentShops, db,
    ] = await Promise.all([
      this.db.shop.count(),
      this.db.user.count(),
      this.db.product.count(),
      this.db.variant.count(),
      this.db.order.count(),
      this.db.chatMessage.count(),
      this.db.telegramConversation.count(),
      this.db.stockAlert.count({ where: { notifiedAt: null } }),
      this.db.order.groupBy({ by: ['status'], _count: { _all: true } }),
      this.db.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 12 }),
      this.db.shop.findMany({
        orderBy: { createdAt: 'desc' },
        take: 6,
        select: {
          id: true, name: true, createdAt: true,
          owner: { select: { email: true } },
          _count: { select: { products: true, orders: true } },
          channel: { select: { active: true, botUsername: true, ownerChat: true } },
        },
      }),
      this.databaseInfo().catch(() => null),
    ]);

    const ai = this.ai.status();
    const telegramConfig = readTelegramConfig();

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
      restartRequired: this.settings.restartRequired(),
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
    const candidate = url.trim() || this.settings.databaseUrl();
    const client = new PrismaClient({ datasources: { db: { url: candidate } }, log: [] });
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
      await client.$disconnect().catch(() => undefined);
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
