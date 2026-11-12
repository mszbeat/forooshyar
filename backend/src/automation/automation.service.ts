import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../logging/audit.service';
import { InstagramClient } from '../instagram/instagram.client';
import { readInstagramConfig } from '../instagram/instagram.config';

/** نرمال‌سازی فارسی برای تطبیق تریگر: ی/ک عربی، نیم‌فاصله، اعداد. */
export function normalizePersian(value: string): string {
  return value
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/‌/g, ' ')
    .replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 1776))
    .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 1632))
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export interface AutomationView {
  id: string;
  name: string;
  active: boolean;
  scope: string;
  mediaIds: string[];
  triggerWords: string[];
  publicReplies: string[];
  dmTemplate: string;
  requireFollow: boolean;
  dailyCap: number;
}

function toView(row: {
  id: string; name: string; active: boolean; scope: string;
  mediaIdsJson: unknown; triggerWordsJson: unknown; publicRepliesJson: unknown;
  dmTemplate: string; requireFollow: boolean; dailyCap: number;
}): AutomationView {
  const list = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  return {
    id: row.id,
    name: row.name,
    active: row.active,
    scope: row.scope,
    mediaIds: list(row.mediaIdsJson),
    triggerWords: list(row.triggerWordsJson),
    publicReplies: list(row.publicRepliesJson),
    dmTemplate: row.dmTemplate,
    requireFollow: row.requireFollow,
    dailyCap: row.dailyCap,
  };
}

/**
 * اتوماسیون کامنت → دایرکت.
 *
 * جریان: رویداد خام کامنت ثبت می‌شود → اگر تریگر خورد، پاسخ عمومی داده
 * می‌شود → بعد DM با `private_reply` (یک پاسخ خصوصی به همان کامنت) و
 * در صورت نیاز `send_message`. همه‌ی قدم‌ها idempotent و لاگ‌دارند.
 */
@Injectable()
export class AutomationService {
  private readonly logger = new Logger('Automation');

  constructor(
    private readonly db: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ------------------------------------------------------------- CRUD
  async list(shopId: string): Promise<AutomationView[]> {
    const rows = await this.db.automation.findMany({
      where: { shopId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toView);
  }

  async create(shopId: string, input: Partial<AutomationView> & { name?: string }): Promise<AutomationView> {
    const row = await this.db.automation.create({
      data: {
        shopId,
        name: (input.name ?? 'اتوماسیون کامنت به دایرکت').trim() || 'اتوماسیون کامنت به دایرکت',
        active: input.active ?? true,
        scope: input.scope ?? 'ALL',
        mediaIdsJson: (input.mediaIds ?? []) as Prisma.InputJsonValue,
        triggerWordsJson: (input.triggerWords ?? []) as Prisma.InputJsonValue,
        publicRepliesJson: (input.publicReplies ?? []) as Prisma.InputJsonValue,
        dmTemplate: input.dmTemplate ?? '',
        requireFollow: input.requireFollow ?? false,
        dailyCap: input.dailyCap ?? 200,
      },
    });
    this.audit.record({ action: 'automation.create', entity: 'automation', entityId: row.id, shopId });
    return toView(row);
  }

  async update(shopId: string, id: string, input: Partial<AutomationView>): Promise<AutomationView> {
    const existing = await this.db.automation.findFirst({ where: { shopId, id } });
    if (!existing) throw new NotFoundException('اتوماسیون پیدا نشد.');
    const data: Prisma.AutomationUpdateInput = {};
    if (input.name !== undefined) data.name = input.name.trim();
    if (input.active !== undefined) data.active = input.active;
    if (input.scope !== undefined) data.scope = input.scope;
    if (input.mediaIds !== undefined) data.mediaIdsJson = input.mediaIds as Prisma.InputJsonValue;
    if (input.triggerWords !== undefined) data.triggerWordsJson = input.triggerWords as Prisma.InputJsonValue;
    if (input.publicReplies !== undefined) data.publicRepliesJson = input.publicReplies as Prisma.InputJsonValue;
    if (input.dmTemplate !== undefined) data.dmTemplate = input.dmTemplate;
    if (input.requireFollow !== undefined) data.requireFollow = input.requireFollow;
    if (input.dailyCap !== undefined) data.dailyCap = input.dailyCap;
    const row = await this.db.automation.update({ where: { shopId_id: { shopId, id } }, data });
    this.audit.record({ action: 'automation.update', entity: 'automation', entityId: id, shopId });
    return toView(row);
  }

  async remove(shopId: string, id: string): Promise<{ ok: true }> {
    const result = await this.db.automation.deleteMany({ where: { shopId, id } });
    if (!result.count) throw new NotFoundException('اتوماسیون پیدا نشد.');
    this.audit.record({ action: 'automation.delete', entity: 'automation', entityId: id, shopId });
    return { ok: true };
  }

  async runs(shopId: string, automationId: string) {
    return this.db.automationRun.findMany({
      where: { shopId, automationId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  // ------------------------------------------------------------- اجرا
  /**
   * پردازش یک کامنت تازه. `raw` بدنه‌ی خام رویداد است و قبل از هر پارسی
   * در `inbound_comment_events` ذخیره می‌شود.
   */
  async processComment(shopId: string, raw: {
    commentId: string; mediaId: string; senderId: string; text: string; rawJson: unknown;
  }): Promise<{ status: string }> {
    const commentId = raw.commentId.trim();
    if (!commentId) return { status: 'SKIPPED' };

    // ثبت رویداد خام (idempotent روی commentId).
    const existing = await this.db.inboundCommentEvent.findFirst({ where: { shopId, commentId } });
    if (existing?.processedAt) return { status: 'SKIPPED' };
    if (!existing) {
      await this.db.inboundCommentEvent.create({
        data: {
          shopId,
          commentId,
          mediaId: raw.mediaId,
          senderId: raw.senderId,
          text: raw.text,
          rawJson: (raw.rawJson ?? {}) as Prisma.InputJsonValue,
        },
      });
    }

    const automations = await this.db.automation.findMany({ where: { shopId, active: true } });
    for (const automation of automations) {
      const view = toView(automation);
      const status = await this.runAutomation(shopId, view, raw).catch((error) => {
        this.logger.warn(`اتوماسیون ${automation.id} روی کامنت ${commentId} ناموفق: ${String(error)}`);
        return 'FAILED';
      });
      await this.db.automationRun.create({
        data: { shopId, automationId: automation.id, commentId, status },
      });
    }

    await this.db.inboundCommentEvent.updateMany({
      where: { shopId, commentId },
      data: { processedAt: new Date() },
    });
    return { status: 'OK' };
  }

  private async runAutomation(shopId: string, automation: AutomationView, raw: {
    commentId: string; mediaId: string; senderId: string; text: string;
  }): Promise<string> {
    // دامنه
    if (automation.scope === 'SELECTED' && !automation.mediaIds.includes(raw.mediaId)) {
      return 'SKIPPED';
    }
    // تریگر
    const normalized = normalizePersian(raw.text);
    if (automation.triggerWords.length > 0) {
      const hit = automation.triggerWords.some((word) => normalized.includes(normalizePersian(word)));
      if (!hit) return 'SKIPPED';
    }
    // سقف روزانه
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const sentToday = await this.db.automationRun.count({
      where: { shopId, automationId: automation.id, status: 'DM_SENT', createdAt: { gte: today } },
    });
    if (sentToday >= automation.dailyCap) return 'SKIPPED';

    const channel = await this.db.channel.findUnique({ where: { shopId }, select: { instagramAccountId: true } });
    const accountId = channel?.instagramAccountId ?? '';
    if (!accountId) return 'FAILED';
    const client = new InstagramClient(readInstagramConfig());

    // پاسخ عمومی (تا ۳ گونه، چرخش تصادفی)
    if (automation.publicReplies.length > 0) {
      const reply = automation.publicReplies[Math.floor(Math.random() * automation.publicReplies.length)];
      const result = await client.replyComment(accountId, raw.commentId, reply);
      if (!result.ok) return 'FAILED';
    }

    // گیت فالو (آسنکرون؛ نتیجه از webhook برمی‌گردد)
    if (automation.requireFollow) {
      await client.post(accountId, 'follow_status', { sender_id: raw.senderId }).catch(() => null);
      return 'FOLLOW_WAIT';
    }

    // DM: اول private_reply روی همان کامنت، بعد send_message
    const shop = await this.db.shop.findFirst({ where: { id: shopId }, select: { name: true } });
    const dm = automation.dmTemplate
      .replaceAll('{shop_name}', shop?.name ?? '')
      .replaceAll('{product_title}', '')
      .replaceAll('{price}', '')
      .replaceAll('{stock}', '');
    const privateResult = await client.post(accountId, 'private_reply', {
      comment_id: raw.commentId,
      message: dm || 'سلام! برای اطلاعات بیشتر دایرکت بدهید 🌿',
    });
    if (!privateResult.ok) return 'FAILED';

    const sent = await client.sendMessage(accountId, {
      recipientId: raw.senderId,
      message: dm || 'سلام! برای اطلاعات بیشتر دایرکت بدهید 🌿',
    });
    return sent.ok ? 'DM_SENT' : 'FAILED';
  }

  /** «تست تریگر»: اجرای همان منطق روی یک متن نمونه، بدون ارسال واقعی. */
  async testTrigger(shopId: string, automationId: string, text: string): Promise<{ matched: boolean }> {
    const automation = await this.db.automation.findFirst({ where: { shopId, id: automationId } });
    if (!automation) throw new BadRequestException('اتوماسیون پیدا نشد.');
    const view = toView(automation);
    if (view.triggerWords.length === 0) return { matched: true };
    const normalized = normalizePersian(text);
    return { matched: view.triggerWords.some((word) => normalized.includes(normalizePersian(word))) };
  }
}
