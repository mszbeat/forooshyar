import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { AuditService } from '../logging/audit.service';
import { TelegramService } from '../telegram/telegram.service';
import { InstagramService } from '../instagram/instagram.service';
import { InstagramClient } from '../instagram/instagram.client';
import { instagramConfigured, readInstagramConfig } from '../instagram/instagram.config';
import { toPlainText } from '../instagram/format';

/**
 * «گفتگوها و مشتریان» — همان چیزی که تا امروز فقط در تلگرام بود.
 *
 * چرا در بک‌اند و نه فقط در پنل: پیام مشتری در `ChatMessage` ذخیره می‌شود ولی
 * تا حالا هیچ مسیری آن را به فروشنده نشان نمی‌داد. این سرویس سه کار می‌کند:
 * فهرست گفتگوها با آخرین پیام، رشته‌ی پیام‌های یک گفتگو، و پاسخ فروشنده که از
 * **همان بات** به مشتری می‌رسد (نه کانال جدا، وگرنه مشتری دو جا باید چک کند).
 */
@Injectable()
export class ChatService {
  constructor(
    private readonly db: PrismaService,
    private readonly audit: AuditService,
    private readonly telegram: TelegramService,
    private readonly realtime: RealtimeService,
  ) {}

  /**
   * فهرست گفتگوها.
   *
   * «بی‌پاسخ» یعنی آخرین پیام از مشتری است — نه شمارنده‌ی دستی که کسی یادش
   * برود صفر کند. همین معیار در اعلان‌ها هم استفاده می‌شود تا دو عدد ناسازگار
   * نبینید.
   */
  async conversations(shopId: string, take = 60) {
    const rows = await this.db.telegramConversation.findMany({
      where: { shopId },
      orderBy: { lastSeenAt: 'desc' },
      take,
    });
    const chatIds = rows.map(row => row.chatId);
    if (chatIds.length === 0) return { items: [], counts: { all: 0, pending: 0, open: 0 } };

    // آخرین پیام هر چت: یک کوئری برای همه، نه N کوئری در حلقه.
    const messages = await this.db.chatMessage.findMany({
      where: { shopId, chatId: { in: chatIds } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, chatId: true, direction: true, text: true, createdAt: true },
    });
    const lastByChat = new Map<string, (typeof messages)[number]>();
    const counts = new Map<string, number>();
    for (const message of messages) {
      if (!lastByChat.has(message.chatId)) lastByChat.set(message.chatId, message);
      counts.set(message.chatId, (counts.get(message.chatId) ?? 0) + 1);
    }

    // سفارش‌های هر چت؛ برای نشان‌دادن «مشتری خریدار» در فهرست.
    const orders = await this.db.order.groupBy({
      by: ['chatId'],
      where: { shopId, chatId: { in: chatIds, not: null } },
      _count: { _all: true },
      _sum: { total: true },
    });
    const orderByChat = new Map(orders.map(row => [row.chatId, row]));

    const items = rows.map(row => {
      const last = lastByChat.get(row.chatId);
      const order = orderByChat.get(row.chatId);
      return {
        id: row.id,
        chatId: row.chatId,
        channel: InstagramService.isInstagramChat(row.chatId) ? 'instagram' : 'telegram',
        name: ChatService.displayName(row),
        username: row.username,
        messageCount: counts.get(row.chatId) ?? row.messageCount,
        lastMessage: last ? { id: last.id, text: last.text.slice(0, 120), direction: last.direction, at: last.createdAt.toISOString() } : null,
        pending: last?.direction === 'in',
        orders: order?._count._all ?? 0,
        spent: order?._sum.total ?? 0,
        lastSeenAt: row.lastSeenAt.toISOString(),
        createdAt: row.createdAt.toISOString(),
      };
    });

    return {
      items,
      counts: {
        all: items.length,
        pending: items.filter(item => item.pending).length,
        open: items.length,
      },
    };
  }

  /**
   * نام نمایشی مشتری.
   *
   * چرا کانال هم مهم است: از وقتی دایرکت اینستاگرام هم در همین صندوق ورودی
   * می‌نشیند، «مشتری تلگرام» برای یک پیام اینستاگرامی گمراه‌کننده است. پیشوند
   * `ig:` روی `chatId` دقیقاً همین را نشان می‌دهد.
   */
  private static displayName(row: { chatId: string; firstName: string; username: string }): string {
    const label = InstagramService.isInstagramChat(row.chatId) ? 'مشتری اینستاگرام' : 'مشتری تلگرام';
    if (row.firstName?.trim()) return row.firstName;
    return row.username ? `@${row.username}` : label;
  }

  /** رشته‌ی پیام‌های یک گفتگو + مشخصات مشتری و سفارش‌هایش. */
  async thread(shopId: string, chatId: string, take = 120) {
    const conversation = await this.db.telegramConversation.findFirst({ where: { shopId, chatId } });
    if (!conversation) throw new NotFoundException('این گفتگو پیدا نشد.');

    const [messages, orders] = await Promise.all([
      this.db.chatMessage.findMany({
        where: { shopId, chatId },
        orderBy: { createdAt: 'asc' },
        take,
        select: {
          id: true, direction: true, author: true, text: true, createdAt: true,
          replyToId: true, replyText: true, replyFrom: true, orderId: true,
        },
      }),
      this.db.order.findMany({
        where: { shopId, chatId },
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: { id: true, code: true, status: true, total: true, createdAt: true },
      }),
    ]);

    return {
      conversation: {
        id: conversation.id,
        chatId: conversation.chatId,
        channel: InstagramService.isInstagramChat(conversation.chatId) ? 'instagram' : 'telegram',
        name: ChatService.displayName(conversation),
        username: conversation.username,
        lastSeenAt: conversation.lastSeenAt.toISOString(),
        createdAt: conversation.createdAt.toISOString(),
      },
      messages: messages.map(message => ({
        id: message.id,
        direction: message.direction === 'in' ? 'in' : 'out',
        // نویسنده: مشتری، بات یا فروشنده. پنل با همین، حباب و برچسب را می‌چیند.
        author: message.author,
        text: message.text,
        at: message.createdAt.toISOString(),
        replyText: message.replyText,
        replyFrom: message.replyFrom,
        orderId: message.orderId,
      })),
      orders: orders.map(order => ({ ...order, createdAt: order.createdAt.toISOString() })),
    };
  }

  /**
   * پاسخ فروشنده از داخل پنل.
   *
   * پیام با همان بات برای مشتری می‌رود و در دیتابیس به‌عنوان پیام `out` ثبت
   * می‌شود؛ پس گفتگو در تلگرام و پنل یکی می‌ماند. اگر بات در آن لحظه در دسترس
   * نباشد، خطا برمی‌گردد و پیام در تاریخچه ثبت **نمی‌شود** — وگرنه فروشنده فکر
   * می‌کند پیام رسیده است.
   */
  async reply(shopId: string, userId: string, chatId: string, text: string) {
    const conversation = await this.db.telegramConversation.findFirst({ where: { shopId, chatId } });
    if (!conversation) throw new NotFoundException('این گفتگو پیدا نشد.');

    // مسیر ارسال به کانال مشتری بستگی دارد: دایرکت اینستاگرام یا چت تلگرام.
    // انتخاب با پیشوند `chatId` است، نه با یک فیلد جدا، تا گفتگوهای قدیمی که
    // قبل از این تغییر ساخته شده‌اند هم درست مسیریابی شوند.
    const sent = InstagramService.isInstagramChat(chatId)
      ? await this.sendInstagram(shopId, chatId, text)
      : await this.telegram.sendTo(chatId, text);
    if (!sent) {
      return {
        ok: false as const,
        error: InstagramService.isInstagramChat(chatId)
          ? 'ارسال نشد؛ اتصال اینستاگرام را در تنظیمات بررسی کنید.'
          : 'ارسال نشد؛ اتصال تلگرام را بررسی کنید.',
      };
    }
    const message = await this.db.chatMessage.create({
      data: { shopId, chatId, direction: 'out', author: 'seller', text },
      select: { id: true, direction: true, text: true, createdAt: true },
    });
    this.realtime.emitShop(shopId, 'chat', { chatId, messageId: message.id, author: 'seller' });
    this.audit.record({
      action: 'chat.seller_reply', entity: 'conversation', entityId: conversation.id,
      shopId, userId,
      meta: {
        chatId,
        length: text.length,
        channel: InstagramService.isInstagramChat(chatId) ? 'instagram' : 'telegram',
      },
    });
    return {
      ok: true as const,
      message: { id: message.id, direction: 'out', text: message.text, at: message.createdAt.toISOString() },
    };
  }

  /**
   * ارسال پاسخ فروشنده از پنل به دایرکت اینستاگرام.
   *
   * پیج از `Channel` همین فروشگاه خوانده می‌شود؛ اگر فروشگاه پیجی وصل نکرده
   * باشد، پیام ارسال نمی‌شود و خطا برمی‌گردد (پنل نباید وانمود کند پیام رفت).
   *
   * چرا کلاینت را مستقیم می‌سازیم و سرویس را تزریق نمی‌کنیم: `InstagramService`
   * به `TelegramService` (برای اعلان فروشنده) وابسته است و این سرویس در همان
   * ماژول تلگرام است؛ تزریق دوطرفه فقط یک چرخه‌ی ماژولی بی‌فایده می‌ساخت.
   * ساختن کلاینت با همان env، رفتار یکسان می‌دهد بدون وابستگی حلقه‌ای.
   */
  private async sendInstagram(shopId: string, chatId: string, text: string): Promise<boolean> {
    const config = readInstagramConfig();
    if (!instagramConfigured(config)) return false;
    const channel = await this.db.channel.findFirst({
      where: { shopId, instagramAccountId: { not: null } },
      select: { instagramAccountId: true },
    });
    if (!channel?.instagramAccountId) return false;

    const client = new InstagramClient(config);
    const result = await client.sendMessage(channel.instagramAccountId, {
      recipientId: InstagramService.recipientOf(chatId),
      message: toPlainText(text).slice(0, 1000),
    });
    if (!result.ok) {
      this.audit.record({
        action: 'instagram.send_failed', entity: 'conversation', shopId, meta: { chatId, error: result.error },
      });
    }
    return result.ok;
  }

  /**
   * فهرست مشتریان.
   *
   * «مشتری» از گفتگو ساخته می‌شود (نه از سفارش): خیلی‌ها می‌پرسند و نمی‌خرند
   * — همان‌ها هم مشتری‌اند و باید بتوانید پیدایشان کنید. خرید و مجموع از
   * سفارش‌ها می‌آید.
   */
  async customers(shopId: string, take = 200) {
    const conversations = await this.db.telegramConversation.findMany({
      where: { shopId },
      orderBy: { lastSeenAt: 'desc' },
      take,
      select: {
        chatId: true, firstName: true, username: true, lastSeenAt: true, createdAt: true, messageCount: true,
      },
    });
    if (conversations.length === 0) return { items: [], counts: { all: 0, buyers: 0, repeat: 0, value: 0 } };

    const chatIds = conversations.map(row => row.chatId);
    const [orders, messages] = await Promise.all([
      this.db.order.findMany({
        where: { shopId, chatId: { in: chatIds, not: null } },
        select: { chatId: true, total: true, status: true, createdAt: true },
      }),
      this.db.chatMessage.groupBy({
        by: ['chatId'],
        where: { shopId, chatId: { in: chatIds } },
        _count: { _all: true },
      }),
    ]);

    const paid = new Set(['PAID', 'SHIPPED', 'COMPLETED']);
    const stat = new Map<string, { orders: number; paid: number; value: number; last: string }>();
    for (const order of orders) {
      if (!order.chatId) continue;
      const current = stat.get(order.chatId) ?? { orders: 0, paid: 0, value: 0, last: '' };
      current.orders += 1;
      if (paid.has(order.status)) {
        current.paid += 1;
        current.value += order.total;
      }
      const at = order.createdAt.toISOString();
      if (at > current.last) current.last = at;
      stat.set(order.chatId, current);
    }
    const messageCount = new Map(messages.map(row => [row.chatId, row._count._all]));

    const items = conversations.map(row => {
      const order = stat.get(row.chatId);
      return {
        chatId: row.chatId,
        channel: InstagramService.isInstagramChat(row.chatId) ? 'instagram' : 'telegram',
        name: ChatService.displayName(row),
        username: row.username,
        messageCount: messageCount.get(row.chatId) ?? row.messageCount,
        orders: order?.orders ?? 0,
        paidOrders: order?.paid ?? 0,
        value: order?.value ?? 0,
        lastActivityAt: order?.last && order.last > row.lastSeenAt.toISOString() ? order.last : row.lastSeenAt.toISOString(),
        firstSeenAt: row.createdAt.toISOString(),
        segments: {
          buyer: (order?.paid ?? 0) > 0,
          repeat: (order?.paid ?? 0) > 1,
          quiet: Date.now() - row.lastSeenAt.getTime() > 21 * 24 * 3600 * 1000,
        },
      };
    });

    return {
      items,
      counts: {
        all: items.length,
        buyers: items.filter(item => item.segments.buyer).length,
        repeat: items.filter(item => item.segments.repeat).length,
        value: items.reduce((sum, item) => sum + item.value, 0),
      },
    };
  }
}
