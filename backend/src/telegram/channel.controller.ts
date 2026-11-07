import { Controller, Delete, Get, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, Principal } from '../auth/auth.guard';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../logging/audit.service';
import { TelegramService } from './telegram.service';

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
  ) {}

  @Get()
  async status(@Req() req: { principal: Principal }) {
    const channel = await this.db.channel.findUnique({ where: { shopId: req.principal.shopId } });
    const identity = await this.telegram.botIdentity();
    const botUsername = identity.username || channel?.botUsername || '';
    const conversations = channel
      ? await this.db.telegramConversation.count({ where: { shopId: channel.shopId } })
      : 0;

    return {
      botConfigured: identity.configured,
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

  /** ساخت (یا فعال‌سازی) اتصال این فروشگاه به بات مشترک. */
  @Post('connect')
  async connect(@Req() req: { principal: Principal }) {
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
