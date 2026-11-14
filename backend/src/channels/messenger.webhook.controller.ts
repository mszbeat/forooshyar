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
 * دامنه‌ی این فاز: پیام در گفتگو ذخیره می‌شود و پاسخ فروشنده از پنل به همان
 * پلتفرم می‌رود؛ تا زمان پیاده‌سازی مغز کامل بات، برای هر پیام تأیید دریافت
 * ارسال می‌شود. پاسخ کاتالوگی و سفارش‌گیری هنوز برای این دو پلتفرم فعال نیست.
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
    const code = message.startCode || extractShopCode(message.text);
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

    // پاسخ‌های کاربردی برای بله و روبیکا: سلام، کاتالوگ/قیمت، ارسال، پرداخت و ساعت کاری.
    // اگر موضوع محصول مشخص باشد قیمت/موجودی از کاتالوگ همان فروشگاه خوانده می‌شود.
    if (!conversation.humanTakeover) {
      const normalized = message.text.toLocaleLowerCase('fa-IR').replace(/[؟?!.،,]/g, ' ').trim();
      const shop = await this.db.shop.findUnique({
        where: { id: shopId },
        select: { name: true, shipping: true, payment: true, workingHours: true, returns: true },
      });
      const products = await this.db.product.findMany({
        where: { shopId, active: true },
        select: { title: true, description: true, defaultPrice: true, variants: { where: { active: true }, select: { price: true, stock: true } } },
        take: 100,
      });
      const isGreeting = /^(سلام|درود|hi|hello|وقت بخیر)(\s|$)/i.test(normalized);
      const wantsCatalog = /محصول|کالا|لیست|فهرست|کاتالوگ/.test(normalized);
      const wantsPrice = /قیمت|چنده|چند تومان|موجود/.test(normalized);
      const matched = products.find(product => normalized.includes(product.title.toLocaleLowerCase('fa-IR')));
      let answer: string;
      if (isGreeting) {
        answer = `سلام! به ${shop?.name ?? 'فروشگاه'} خوش آمدید 🌷\nنام محصول یا «محصولات» را بفرستید تا قیمت و موجودی را ببینید.`;
      } else if ((wantsPrice || wantsCatalog) && matched) {
        const prices = matched.variants.map(v => v.price).filter(Number.isFinite);
        if (!prices.length && matched.defaultPrice != null) prices.push(matched.defaultPrice);
        const priceText = prices.length ? (Math.min(...prices) === Math.max(...prices)
          ? `${Math.min(...prices).toLocaleString('fa-IR')} تومان`
          : `از ${Math.min(...prices).toLocaleString('fa-IR')} تا ${Math.max(...prices).toLocaleString('fa-IR')} تومان`) : 'برای قیمت با فروشنده هماهنگ کنید';
        const stock = matched.variants.length ? (matched.variants.some(v => v.stock > 0) ? 'موجود' : 'فعلاً ناموجود') : '';
        answer = `🛍 ${matched.title}\n💰 ${priceText}${stock ? `\n📦 ${stock}` : ''}${matched.description ? `\n${matched.description}` : ''}`;
      } else if (wantsCatalog || wantsPrice) {
        answer = products.length
          ? `🛍 محصولات فروشگاه:\n${products.slice(0, 20).map(p => `• ${p.title}${p.defaultPrice != null ? ` — ${p.defaultPrice.toLocaleString('fa-IR')} تومان` : ''}`).join('\n')}\n\nبرای جزئیات، نام محصول را بفرستید.`
          : 'هنوز محصولی در کاتالوگ فروشگاه ثبت نشده است.';
      } else if (/ارسال|تحویل/.test(normalized)) answer = shop?.shipping || 'اطلاعات ارسال هنوز ثبت نشده؛ پیام‌تان را برای فروشنده فرستادم.';
      else if (/پرداخت|کارت|واریز/.test(normalized)) answer = shop?.payment || 'اطلاعات پرداخت را فروشنده برایتان می‌فرستد.';
      else if (/ساعت کاری|چه ساعتی|کی باز/.test(normalized)) answer = shop?.workingHours || 'ساعت کاری در تنظیمات فروشگاه ثبت نشده است.';
      else if (/مرجوع|تعویض/.test(normalized)) answer = shop?.returns || 'برای مرجوعی یا تعویض لطفاً با فروشنده هماهنگ کنید.';
      else answer = 'ممنون از پیامتان! می‌توانم درباره قیمت و موجودی، ارسال، پرداخت و ساعت کاری راهنمایی کنم. نام محصول یا موضوع سؤال‌تان را بنویسید.';

      const delivered = await adapter.send({ chatId: message.chatId, text: answer });
      if (delivered.ok) {
        const reply = await this.db.chatMessage.create({
          data: { shopId, chatId, direction: 'out', author: 'bot', text: answer },
          select: { id: true },
        });
        this.realtime.emitShop(shopId, 'chat', { chatId, messageId: reply.id, author: 'bot' });
      }
    }
  }
}
