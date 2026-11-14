import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { AuditService } from '../logging/audit.service';
import { TelegramService } from '../telegram/telegram.service';
import { BaleAdapter, RubikaAdapter } from '../channels/channel-adapters';

/**
 * شماره‌ی مستعار پایدار برای یک گفتگو.
 *
 * چرا: اگر نام واقعی مشتری در دسترس نباشد، به‌جای «مشتری اینستاگرام»ِ تکراری
 * برای همه، هر مشتری یک نام مستعار **ثابت** می‌گیرد (مثلاً «مشتری اینستاگرام
 * ۴۲۱۷») تا فروشنده بتواند او را از بقیه تشخیص دهد و در گفتگوهای بعدی همان
 * نام را ببیند. عدد از هش `chatId` ساخته می‌شود؛ پس با هر بار محاسبه یکی است.
 */
export function pseudonymNumber(chatId: string): number {
  let hash = 0;
  for (const char of chatId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return 1000 + (hash % 9000);
}

/**
 * نام نمایشی یک گفتگو، با توجه به کانال.
 *
 * اولویت: نام واقعی (firstName) ← نام کاربری (@username) ← نام مستعار پایدار.
 * گفتگوهای اینستاگرام هم در همین جدول‌اند (`chatId` با پیشوند `ig:`)؛ اگر برای
 * همه «مشتری تلگرام» برگردانیم، در پنلِ اینستاگرام دکمه‌ی «آزمایش به مشتری
 * تلگرام» دیده می‌شود. پس نامِ پیش‌فرض به کانال بستگی دارد.
 */
export function displayName(row: { chatId: string; firstName: string; username: string }): string {
  if (row.firstName) return row.firstName;
  if (row.username) return `@${row.username.replace(/^@/, '')}`;
  const channel = row.chatId.startsWith('ig:')
    ? 'اینستاگرام'
    : row.chatId.startsWith('bale:')
      ? 'بله'
      : row.chatId.startsWith('rubika:')
        ? 'روبیکا'
        : 'تلگرام';
  return `مشتری ${channel} ${pseudonymNumber(row.chatId).toLocaleString('fa-IR')}`;
}

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
        name: displayName(row),
        username: row.username,
        platform: row.chatId.startsWith('ig:') ? 'INSTAGRAM' : row.chatId.startsWith('bale:') ? 'BALE' : row.chatId.startsWith('rubika:') ? 'RUBIKA' : 'TELEGRAM',
        humanTakeover: row.humanTakeover,
        lastReplySource: row.lastReplySource,
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
        name: displayName(conversation),
        username: conversation.username,
        platform: conversation.chatId.startsWith('ig:') ? 'INSTAGRAM' : conversation.chatId.startsWith('bale:') ? 'BALE' : conversation.chatId.startsWith('rubika:') ? 'RUBIKA' : 'TELEGRAM',
        humanTakeover: conversation.humanTakeover,
        lastReplySource: conversation.lastReplySource,
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

  /** ارسال پیام به مشتری با باتِ همان کانال (پیشوند chatId مشخص می‌کند). */
  private async sendByChannel(chatId: string, text: string): Promise<boolean> {
    if (chatId.startsWith('bale:')) {
      const result = await new BaleAdapter((process.env.BALE_BOT_TOKEN ?? '').trim())
        .send({ chatId: chatId.slice('bale:'.length), text });
      return result.ok;
    }
    if (chatId.startsWith('rubika:')) {
      const result = await new RubikaAdapter((process.env.RUBIKA_BOT_TOKEN ?? '').trim())
        .send({ chatId: chatId.slice('rubika:'.length), text });
      return result.ok;
    }
    return this.telegram.sendTo(chatId, text);
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

    const sent = await this.sendByChannel(chatId, text);
    if (!sent) {
      return { ok: false as const, error: 'ارسال نشد؛ اتصال تلگرام را بررسی کنید.' };
    }
    const message = await this.db.chatMessage.create({
      data: { shopId, chatId, direction: 'out', author: 'seller', text },
      select: { id: true, direction: true, text: true, createdAt: true },
    });
    this.realtime.emitShop(shopId, 'chat', { chatId, messageId: message.id, author: 'seller' });
    this.audit.record({
      action: 'chat.seller_reply', entity: 'conversation', entityId: conversation.id,
      shopId, userId, meta: { chatId, length: text.length },
    });
    return {
      ok: true as const,
      message: { id: message.id, direction: 'out', text: message.text, at: message.createdAt.toISOString() },
    };
  }

  /**
   * take-over: فروشنده گفتگو را در دست می‌گیرد (بات دیگر خودکار جواب
   * نمی‌دهد) یا به بات برمی‌گرداند.
   */
  async setTakeover(shopId: string, userId: string, chatId: string, takeover: boolean) {
    const conversation = await this.db.telegramConversation.findFirst({ where: { shopId, chatId } });
    if (!conversation) throw new NotFoundException('این گفتگو پیدا نشد.');
    const updated = await this.db.telegramConversation.update({
      where: { id: conversation.id },
      data: { humanTakeover: takeover },
    });
    this.realtime.emitShop(shopId, 'chat', { chatId, takeover });
    this.audit.record({
      action: takeover ? 'chat.takeover' : 'chat.return_to_bot',
      entity: 'conversation', entityId: conversation.id, shopId, userId, meta: { chatId },
    });
    return { ok: true as const, humanTakeover: updated.humanTakeover };
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
        name: displayName(row),
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
