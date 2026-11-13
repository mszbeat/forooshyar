import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ChannelPlatform } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../logging/audit.service';
import { encryptCard, decryptCard } from '../payments/card-crypto';

export interface ChannelConnectionView {
  id: string;
  platform: ChannelPlatform;
  status: string;
  displayName: string;
  username: string;
  avatarUrl: string;
  externalId: string;
  hasSecret: boolean;
  expiresAt: string | null;
  lastSeenAt: string | null;
  lastError: string;
}

function toView(row: {
  id: string; platform: ChannelPlatform; status: string; displayName: string;
  username: string; avatarUrl: string; externalId: string; secretEnc: string;
  expiresAt: Date | null; lastSeenAt: Date | null; lastError: string;
}): ChannelConnectionView {
  return {
    id: row.id,
    platform: row.platform,
    status: row.status,
    displayName: row.displayName,
    username: row.username,
    avatarUrl: row.avatarUrl,
    externalId: row.externalId,
    hasSecret: row.secretEnc.length > 0,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
    lastError: row.lastError,
  };
}

/**
 * اتصال‌های کانال فروشگاه: اینستاگرام (BoxAPI)، تلگرام، بله، روبیکا.
 * توکن بات‌ها رمزنگاری‌شده ذخیره می‌شوند و هرگز در پاسخ برنمی‌گردند.
 */
@Injectable()
export class ChannelsService {
  constructor(
    private readonly db: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(shopId: string): Promise<ChannelConnectionView[]> {
    const rows = await this.db.channelConnection.findMany({
      where: { shopId },
      orderBy: [{ platform: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map(toView);
  }

  /**
   * ثبت/به‌روزرسانی اتصال. برای اینستاگرام `externalId` همان account_id
   * BoxAPI است و سکرتی لازم نیست؛ برای تلگرام توکن رمزنگاری می‌شود.
   *
   * بله و روبیکا «بات مشترک» دارند: توکن و سکرت webhook فقط از env یا پنل
   * ادمین می‌آیند (`BALE_BOT_TOKEN`/`RUBIKA_BOT_TOKEN`) و فروشنده هرگز توکن
   * خودش را وارد نمی‌کند؛ پس اگر `secret` برای این دو پلتفرم آمد، رد می‌شود.
   */
  async connect(shopId: string, input: {
    platform: ChannelPlatform;
    externalId: string;
    displayName?: string;
    username?: string;
    avatarUrl?: string;
    secret?: string;
    expiresAt?: string;
  }): Promise<ChannelConnectionView> {
    const externalId = input.externalId.trim();
    if (!externalId) throw new BadRequestException('شناسه‌ی حساب لازم است.');
    if ((input.platform === 'BALE' || input.platform === 'RUBIKA') && input.secret) {
      const label = input.platform === 'BALE' ? 'بله' : 'روبیکا';
      throw new BadRequestException(
        `توکن بات ${label} توسط مدیر پلتفرم تنظیم می‌شود؛ نیازی به وارد کردن توکن نیست. فقط اتصال را فعال کنید.`,
      );
    }
    const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
    if (input.expiresAt && Number.isNaN(expiresAt?.getTime())) {
      throw new BadRequestException('تاریخ انقضا معتبر نیست.');
    }

    const existing = await this.db.channelConnection.findFirst({
      where: { shopId, platform: input.platform, externalId },
    });

    const data = {
      status: 'CONNECTED' as const,
      displayName: (input.displayName ?? '').trim(),
      username: (input.username ?? '').trim(),
      avatarUrl: (input.avatarUrl ?? '').trim(),
      expiresAt,
      lastError: '',
      ...(input.secret ? { secretEnc: encryptCard(input.secret.trim()) } : {}),
    };

    const row = existing
      ? await this.db.channelConnection.update({ where: { id: existing.id }, data })
      : await this.db.channelConnection.create({
          data: { shopId, platform: input.platform, externalId, ...data },
        });

    // بله/روبیکا هم برای مسیریابی webhook به کد لینک فروشگاه نیاز دارند.
    if (input.platform === 'BALE' || input.platform === 'RUBIKA') {
      await this.ensureChannelCode(shopId);
    }

    this.audit.record({
      action: 'channel.connect',
      entity: 'channel_connection',
      entityId: row.id,
      shopId,
      meta: { platform: input.platform, externalId, username: row.username },
    });
    return toView(row);
  }

  /**
   * کد لینک فروشگاه (همان `Channel.code` تلگرام) را تضمین می‌کند.
   * مسیریابی webhook بله/روبیکا به فروشگاه با همین کد انجام می‌شود
   * (`/start <code>`)، پس فروشگاهی که فقط بله/روبیکا وصل کرده هم باید
   * ردیف Channel داشته باشد.
   */
  async ensureChannelCode(shopId: string): Promise<string> {
    const existing = await this.db.channel.findUnique({ where: { shopId }, select: { code: true } });
    if (existing) return existing.code;
    const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
    let code = '';
    for (let i = 0; i < 8; i += 1) code += alphabet[Math.floor(Math.random() * alphabet.length)];
    await this.db.channel.create({ data: { shopId, code } });
    return code;
  }

  /**
   * لینک فروشگاه برای مشتریان در بله/روبیکا (مثل لینک تلگرام).
   * نام کاربری بات از تنظیمات ادمین/env می‌آید؛ اگر ست نشده باشد لینک null
   * برمی‌گردد تا پنل به‌جای لینک خراب، راهنما نشان دهد.
   */
  async shopLink(shopId: string, platform: 'BALE' | 'RUBIKA'): Promise<{
    link: string | null; code: string; botUsername: string;
  }> {
    const code = await this.ensureChannelCode(shopId);
    const botUsername = (process.env[platform === 'BALE' ? 'BALE_BOT_USERNAME' : 'RUBIKA_BOT_USERNAME'] ?? '')
      .trim().replace(/^@/, '');
    if (!botUsername) return { link: null, code, botUsername: '' };
    const base = platform === 'BALE' ? `https://ble.ir/${botUsername}` : `https://rubika.ir/${botUsername}`;
    return { link: `${base}?start=${code}`, code, botUsername };
  }

  async disconnect(shopId: string, id: string): Promise<{ ok: true }> {
    const result = await this.db.channelConnection.updateMany({
      where: { shopId, id },
      data: { status: 'DISCONNECTED' },
    });
    if (!result.count) throw new NotFoundException('اتصال پیدا نشد.');
    this.audit.record({ action: 'channel.disconnect', entity: 'channel_connection', entityId: id, shopId });
    return { ok: true };
  }

  async remove(shopId: string, id: string): Promise<{ ok: true }> {
    const result = await this.db.channelConnection.deleteMany({ where: { shopId, id } });
    if (!result.count) throw new NotFoundException('اتصال پیدا نشد.');
    this.audit.record({ action: 'channel.remove', entity: 'channel_connection', entityId: id, shopId });
    return { ok: true };
  }

  /** توکن رمزگشایی‌شده برای ارسال (فقط سمت سرور). */
  async secretFor(shopId: string, id: string): Promise<string> {
    const row = await this.db.channelConnection.findFirst({ where: { shopId, id } });
    if (!row || !row.secretEnc) return '';
    try {
      return decryptCard(row.secretEnc);
    } catch {
      return '';
    }
  }

  /** علامت‌گذاری خطا/سلامت اتصال (از webhook/ارسال). */
  async markError(id: string, error: string) {
    await this.db.channelConnection.updateMany({
      where: { id },
      data: { status: 'ERROR', lastError: error.slice(0, 500), lastSeenAt: new Date() },
    });
  }

  async markSeen(id: string) {
    await this.db.channelConnection.updateMany({
      where: { id },
      data: { lastSeenAt: new Date() },
    });
  }
}
