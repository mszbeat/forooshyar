import { Body, Controller, HttpCode, Logger, Param, Post } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from '../database/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import {
  BaleAdapter,
  RubikaAdapter,
  extractShopCode,
  verifyWebhookSecret,
  type IncomingMessage,
} from './channel-adapters';

/**
 * webhook بات‌های مشترک بله و روبیکا.
 *
 * چرا بات مشترک: یک بات برای همه‌ی فروشگاه‌ها (مثل تلگرام). توکن و سکرت فقط
 * از env یا پنل ادمین می‌آیند (`BALE_BOT_TOKEN`/`RUBIKA_BOT_TOKEN` و سکرت‌های
 * متناظر) و فروشنده هرگز توکن خودش را وارد نمی‌کند. مسیریابی به فروشگاه با
 * کد لینک انجام می‌شود: مشتری از لینک فروشگاه وارد می‌شود و اولین پیامش
 * `/start <code>` است (همان الگوی تلگرام).
 *
 * امنیت مثل تلگرام است: مسیر شامل سکرت است و با مقایسه‌ی زمان‌ثابت بررسی
 * می‌شود؛ همیشه ۲۰۰ برمی‌گردانیم تا ارائه‌دهنده همان update را دوباره
 * نفرستد. هیچ AuthGuardای اینجا نیست چون ارائه‌دهنده توکن ما را ندارد.
 *
 * دامنه‌ی این فاز: پیام در گفتگو ذخیره می‌شود و فروشنده از پنل جواب می‌دهد؛
 * فقط برای اولین پیام یک پاسخ «دریافت شد» می‌رود. مغز کامل بات (کاتالوگ و
 * سفارش) برای این دو پلتفرم در فاز بعد می‌آید.
 */
@Controller()
@SkipThrottle()
export class MessengerWebhookController {
  private readonly logger = new Logger('MessengerWebhook');
  /** حذف تکراری update_id در حافظه (۱۰ دقیقه)؛ webhook بی‌حالت است. */
  private readonly seenUpdates = new Map<string, number>();

  constructor(
    private readonly db: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  @Post('bale/webhook/:secret')
  @HttpCode(200)
  async bale(@Param('secret') secret: string, @Body() update: unknown) {
    return this.handle('BALE', secret, update);
  }

  @Post('rubika/webhook/:secret')
  @HttpCode(200)
  async rubika(@Param('secret') secret: string, @Body() update: unknown) {
    return this.handle('RUBIKA', secret, update);
  }

  private async handle(platform: 'BALE' | 'RUBIKA', secret: string, update: unknown) {
    const expected = (process.env[platform === 'BALE' ? 'BALE_WEBHOOK_SECRET' : 'RUBIKA_WEBHOOK_SECRET'] ?? '').trim();
    if (!verifyWebhookSecret(expected, secret)) {
      // ۲۰۰ بی‌جزئیات؛ در لاگ هم چیزی از سکرت نمی‌نویسیم.
      return { ok: false, error: 'unauthorized' };
    }

    const message = platform === 'BALE' ? BaleAdapter.normalize(update) : RubikaAdapter.normalize(update);
    if (!message) return { ok: true };

    try {
      await this.route(message);
    } catch (error) {
      this.logger.error(
        `پردازش پیام ${platform} ناموفق بود: ${error instanceof Error ? error.message : 'unknown'}`,
      );
    }
    return { ok: true };
  }

  private async route(message: IncomingMessage) {
    // حذف تکراری: ارائه‌دهنده ممکن است همان update را دوباره بفرستد.
    if (message.updateId) {
      const key = `${message.platform}:${message.updateId}`;
      const now = Date.now();
      for (const [seenKey, at] of this.seenUpdates) {
        if (now - at > 10 * 60 * 1000) this.seenUpdates.delete(seenKey);
      }
      if (this.seenUpdates.has(key)) return;
      this.seenUpdates.set(key, now);
      if (this.seenUpdates.size > 5000) {
        const oldest = this.seenUpdates.keys().next().value;
        if (oldest) this.seenUpdates.delete(oldest);
      }
    }

    const adapter = message.platform === 'BALE'
      ? new BaleAdapter((process.env.BALE_BOT_TOKEN ?? '').trim())
      : new RubikaAdapter((process.env.RUBIKA_BOT_TOKEN ?? '').trim());

    // chatId با پیشوند پلتفرم ذخیره می‌شود تا با تلگرام/اینستاگرام قاطی نشود.
    const chatId = `${message.platform === 'BALE' ? 'bale' : 'rubika'}:${message.chatId}`;

    // مسیریابی به فروشگاه با کد لینک؛ بدون کد، فروشگاه معلوم نیست.
    const code = extractShopCode(message.text);
    let shopId = '';
    if (code) {
      const channel = await this.db.channel.findUnique({ where: { code }, select: { shopId: true } });
      shopId = channel?.shopId ?? '';
    }
    if (!shopId) {
      const existing = await this.db.telegramConversation.findFirst({
        where: { chatId },
        select: { shopId: true },
      });
      shopId = existing?.shopId ?? '';
    }

    if (!shopId) {
      // هنوز به هیچ فروشگاهی وصل نیست: راهنما می‌فرستیم، چیزی ذخیره نمی‌کنیم.
      await adapter.send({
        chatId: message.chatId,
        text: 'سلام! برای گفتگو با فروشگاه، از لینک همان فروشگاه وارد شوید؛ بعد از آن همین‌جا پاسخ می‌دهیم.',
      });
      return;
    }

    const conversation = await this.db.telegramConversation.upsert({
      where: { shopId_chatId: { shopId, chatId } },
      create: {
        shopId,
        chatId,
        username: message.senderUsername,
        firstName: message.senderName,
        messageCount: 1,
      },
      update: {
        username: message.senderUsername || undefined,
        firstName: message.senderName || undefined,
        messageCount: { increment: 1 },
        lastSeenAt: new Date(),
      },
    });

    const saved = await this.db.chatMessage.create({
      data: {
        shopId,
        chatId,
        direction: 'in',
        author: 'customer',
        text: message.text || '(پیام بدون متن)',
      },
      select: { id: true },
    });
    this.realtime.emitShop(shopId, 'chat', { chatId, messageId: saved.id, author: 'customer' });

    // فقط اولین پیام پاسخ «دریافت شد» می‌گیرد؛ بقیه را فروشنده از پنل جواب می‌دهد.
    if (conversation.messageCount <= 1) {
      await adapter.send({
        chatId: message.chatId,
        text: 'سلام! پیام شما دریافت شد و فروشنده به‌زودی پاسخ می‌دهد. اگر برای خرید آماده‌اید، همین‌جا بنویسید.',
      });
    }
  }
}
