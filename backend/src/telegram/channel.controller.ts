import { BadRequestException, Controller, Delete, Get, Headers, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, Principal } from '../auth/auth.guard';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../logging/audit.service';
import { TelegramService } from './telegram.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';

/**
 * مدیریت اتصال تلگرام از داخل پنل. همه‌ی مسیرها با AuthGuard محافظت می‌شوند و
 * فقط به فروشگاه خودِ توکن دسترسی دارند (`req.principal.shopId`).
 *
 * الگوی کدها:
 *  - `code`      : لینک مشتری، ثابت. t.me/<bot>?start=<code>
 *  - `ownerCode` : یک‌بارمصرف، برای اتصال چت فروشنده؛ بعد از استفاده پاک می‌شود.
 */
@Controller('channel/telegram')
@UseGuards(AuthGuard)
export class ChannelController {
  constructor(
    private readonly db: PrismaService,
    private readonly telegram: TelegramService,
    private readonly audit: AuditService,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  @Get()
  async status(@Req() req: { principal: Principal }) {
    const channel = await this.db.channel.findUnique({ where: { shopId: req.principal.shopId } });
    // getMe و getWebhookInfo موازی، تا صفحه‌ی تنظیمات دو بار تایم‌اوت نخورد.
    const [identity, hook] = await Promise.all([
      this.telegram.botIdentity(),
      this.telegram.configured ? this.telegram.webhookInfo() : Promise.resolve(null),
    ]);
    const botUsername = identity.username || channel?.botUsername || '';
    const conversations = channel
      ? await this.db.telegramConversation.count({ where: { shopId: channel.shopId } })
      : 0;

    const hookUrl = hook?.ok ? (hook.result.url ?? '') : '';
    const webhook = {
      registered: Boolean(hookUrl),
      // آدرس داخل تلگرام با آدرسی که این سرویس فکر می‌کند یکی است؟
      pointsHere: Boolean(hookUrl) && (
        (process.env.PUBLIC_API_URL ?? '').trim() !== ''
          ? hookUrl.startsWith((process.env.PUBLIC_API_URL ?? '').trim().replace(/\/+$/, ''))
          : true
      ),
      pending: hook?.ok ? (hook.result.pending_update_count ?? 0) : 0,
      /**
       * دکمه‌های inline فقط با callback_query کار می‌کنند. اگر webhook قبلاً
       * بدون آن ثبت شده باشد، تلگرام کلیک دکمه را برای ما نمی‌فرستد و هیچ خطایی
       * هم دیده نمی‌شود — پس همین‌جا تشخیص می‌دهیم.
       */
      buttonsWork: hook?.ok
        ? (hook.result.allowed_updates ?? []).length === 0 || (hook.result.allowed_updates ?? []).includes('callback_query')
        : true,
      lastError: hook?.ok ? (hook.result.last_error_message ?? '') : '',
      error: hook && !hook.ok ? (hook.description ?? hook.error) : '',
    };

    return {
      botConfigured: identity.configured,
      webhook,
      botUsername,
      // لینکی که فروشنده به مشتری‌ها می‌دهد
      customerLink: channel && botUsername ? `https://t.me/${botUsername}?start=${channel.code}` : null,
      code: channel?.code ?? null,
      active: channel?.active ?? false,
      ownerLinked: Boolean(channel?.ownerChat),
      ownerLinkedAt: channel?.ownerLinkedAt ?? null,
      conversations,
    };
  }

  /**
   * ثبت webhook از سمت خود سرور.
   *
   * چرا اینجا و نه با اسکریپت روی لپ‌تاپ: سرور روی Render به تلگرام دسترسی دارد
   * ولی شبکه‌ی توسعه‌دهنده ممکن است نداشته باشد. سکرت و آدرس از Environment
   * خوانده می‌شوند، پس با این مسیر هیچ‌وقت نمی‌توان webhook را به آدرس دیگری
   * نشاند و سکرت هم در پاسخ برنمی‌گردد.
   */
  @Post('register-webhook')
  @HttpCode(200)
  async registerWebhook(@Headers() headers: Record<string, string | string[] | undefined>) {
    if (!this.telegram.configured) {
      throw new BadRequestException('TELEGRAM_BOT_TOKEN روی سرور تنظیم نشده است.');
    }
    const secret = (process.env.TELEGRAM_WEBHOOK_SECRET ?? '').trim();
    if (secret.length < 16) {
      throw new BadRequestException('TELEGRAM_WEBHOOK_SECRET باید حداقل ۱۶ کاراکتر باشد و روی سرور ست شود.');
    }
    const publicUrl = TelegramService.resolvePublicUrl(headers);
    if (!publicUrl.startsWith('https://')) {
      // تلگرام فقط https را می‌پذیرد؛ بهتر است همین‌جا روشن بگوییم تا خطای مبهم نگیریم.
      throw new BadRequestException('آدرس عمومی سرویس پیدا نشد یا https نیست. PUBLIC_API_URL را ست کن.');
    }

    const url = `${publicUrl}/telegram/webhook/${secret}`;
    const result = await this.telegram.registerWebhook(url, secret);
    this.audit.record({
      action: result.ok ? 'telegram.webhook_registered' : 'telegram.webhook_failed',
      entity: 'channel',
      entityId: 'webhook',
      shopId: undefined,
      meta: { host: publicUrl, error: result.ok ? undefined : (result.description ?? result.error) },
    });
    if (!result.ok) {
      throw new BadRequestException(result.description ?? `ثبت webhook ناموفق بود (${result.error})`);
    }
    return { ok: true, url: url.replace(secret, '…'), pending: 0 };
  }

  /** ساخت (یا فعال‌سازی) اتصال این فروشگاه به بات مشترک. */
  @Post('connect')
  async connect(@Req() req: { principal: Principal }) {
    await this.subscriptions.assertCanConnect(req.principal.shopId);
    const identity = await this.telegram.botIdentity();
    const code = TelegramService.generateCode();
    const channel = await this.db.channel.upsert({
      where: { shopId: req.principal.shopId },
      update: { active: true, botUsername: identity.username },
      create: { shopId: req.principal.shopId, code, botUsername: identity.username },
    });
    this.audit.record({
      action: 'channel.telegram_connect',
      entity: 'channel',
      entityId: channel.id,
      shopId: channel.shopId,
      userId: req.principal.userId,
      meta: { botUsername: identity.username },
    });
    return this.status(req);
  }

  /** کد یک‌بارمصرف برای اتصال چت فروشنده (اعلان فروش و موجودی کم). */
  @Post('owner-code')
  async ownerCode(@Req() req: { principal: Principal }) {
    const channel = await this.db.channel.findUnique({ where: { shopId: req.principal.shopId } });
    if (!channel) return { ownerCode: null, ownerLink: null, reason: 'not_connected' };
    const identity = await this.telegram.botIdentity();
    const ownerCode = TelegramService.generateCode(10);
    const updated = await this.db.channel.update({ where: { id: channel.id }, data: { ownerCode, botUsername: identity.username } });
    this.audit.record({
      action: 'channel.owner_code',
      entity: 'channel',
      entityId: updated.id,
      shopId: updated.shopId,
      userId: req.principal.userId,
    });
    return {
      ownerCode,
      ownerLink: identity.username ? `https://t.me/${identity.username}?start=own_${ownerCode}` : null,
      // جمله‌ی آماده برای فرستادن در چت با بات
      command: `/link ${ownerCode}`,
    };
  }

  @Post('disconnect-owner')
  @HttpCode(200)
  async disconnectOwner(@Req() req: { principal: Principal }) {
    const channel = await this.db.channel.findUnique({ where: { shopId: req.principal.shopId } });
    if (channel) {
      await this.db.channel.update({ where: { id: channel.id }, data: { ownerChat: null, ownerLinkedAt: null } });
      this.audit.record({ action: 'channel.telegram_disconnect_owner', entity: 'channel', entityId: channel.id, shopId: channel.shopId, userId: req.principal.userId });
    }
    return this.status(req);
  }

  @Delete()
  async remove(@Req() req: { principal: Principal }) {
    const channel = await this.db.channel.findUnique({ where: { shopId: req.principal.shopId } });
    if (channel) {
      await this.db.channel.update({ where: { id: channel.id }, data: { active: false, ownerChat: null, ownerLinkedAt: null } });
      this.audit.record({ action: 'channel.telegram_disable', entity: 'channel', entityId: channel.id, shopId: channel.shopId, userId: req.principal.userId });
    }
    return this.status(req);
  }
}
