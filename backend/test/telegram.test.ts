/**
 * تست تلگرام بدون شبکه‌ی واقعی و بدون توکن واقعی.
 *
 * یک سرور HTTP جعلی نقش api.telegram.org را بازی می‌کند: هر درخواست
 * `/bot<token>/<method>` را ثبت می‌کند و پاسخ می‌دهد. بعد کل زنجیره را با
 * fetch واقعی روی همان سرور تست می‌کنیم — نه mock در سطح تابع.
 *
 * نیاز به دیتابیس دارد (DATABASE_URL یا DB_*). اگر نبود، تست‌ها skip می‌شوند.
 */
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { after, before, describe, it } from 'node:test';

type Captured = { method: string; body: Record<string, unknown>; token: string };

let server: Server;
let base = '';
let captured: Captured[] = [];
let databaseReady = false;
let prisma: import('@prisma/client').PrismaClient;
let telegram: import('../src/telegram/telegram.service').TelegramService;
let payments: import('../src/payments/payments.service').PaymentsService;
let seed: {
  shopId: string; userId: string; variantId: string; channelCode: string;
  productId: string; secondProductId: string; secondVariantId: string;
};
let handoffUpdateId = 0;

const SECRET = 'test-secret-token';
const BOT_USERNAME = 'forooshyar_test_bot';

before(async () => {
  process.env.TELEGRAM_BOT_TOKEN = '123456:test-token';
  process.env.TELEGRAM_WEBHOOK_SECRET = SECRET;

  // ---- سرور جعلی تلگرام -------------------------------------------------
  server = createServer((request, response) => {
    let raw = '';
    request.on('data', chunk => { raw += chunk; });
    request.on('end', () => {
      const match = /^\/bot([^/]+)\/(\w+)$/.exec(request.url ?? '');
      if (!match) { response.statusCode = 404; response.end('{}'); return; }
      const body = raw ? JSON.parse(raw) as Record<string, unknown> : {};
      captured.push({ method: match[2], body, token: match[1] });

      const respond = (payload: unknown) => {
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify(payload));
      };

      if (match[2] === 'getMe') return respond({ ok: true, result: { id: 42, username: BOT_USERNAME, is_bot: true } });
      if (match[2] === 'sendMessage') {
        if (String(body.text ?? '').includes('FAIL_SEND')) {
          return respond({ ok: false, error_code: 403, description: 'Forbidden: bot was blocked by the user' });
        }
        return respond({ ok: true, result: { message_id: captured.length, chat: { id: body.chat_id } } });
      }
      if (match[2] === 'setWebhook') return respond({ ok: true, result: true });
      if (match[2] === 'getWebhookInfo') return respond({ ok: true, result: { url: 'https://x/telegram/webhook/s', pending_update_count: 0 } });
      return respond({ ok: true, result: true });
    });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
  process.env.TELEGRAM_API_BASE = base;

  // ---- دیتابیس ----------------------------------------------------------
  const { PrismaClient } = await import('@prisma/client');
  const { databaseUrl } = await import('../src/config');
  const url = databaseUrl(process.env);
  if (!url) { databaseReady = false; return; }
  prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    await prisma.$queryRaw`SELECT 1`;
    databaseReady = true;
  } catch { databaseReady = false; return; }

  const { TelegramService } = await import('../src/telegram/telegram.service');
  const { OrdersService } = await import('../src/orders/orders.service');
  const { PaymentsService } = await import('../src/payments/payments.service');
  // AuditService واقعی ولی بدون دیتابیس‌زدنِ اضافی: همان نسخه‌ای که در برنامه است
  const { AuditService } = await import('../src/logging/audit.service');
  const audit = new AuditService(prisma as never, false);
  // چرخه‌ی بات/سفارش در تست: اول بات با جای خالی، بعد سفارش، بعد وصل‌کردن.
  telegram = new TelegramService(prisma as never, audit, undefined as never, undefined as never);
  const orders = new OrdersService(prisma as never, audit, telegram);
  payments = new PaymentsService(orders);
  Object.assign(telegram as unknown as Record<string, unknown>, { orders, payments });

  // داده‌ی تست: فروشگاه + یک محصول با یک واریانت
  const email = `tg-${Date.now()}@example.com`;
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: 'x',
      shop: { create: { name: 'فروشگاه تست تلگرام', shipping: 'ارسال با پست، ۲ تا ۴ روز کاری.', workingHours: 'هر روز ۹ تا ۱۸.' } },
    },
    include: { shop: true },
  });
  const shopId = user.shop!.id;
  const product = await prisma.product.create({
    data: {
      shopId, title: 'مانتو آبی', active: true,
      variants: { create: [{ size: '۴۲', color: 'آبی', price: 850000, stock: 5 }] },
    },
    include: { variants: true },
  });
  // محصول دوم با یک واژه‌ی مشترک: برای تست «این مانتو چنده» → ابهام
  const product2 = await prisma.product.create({
    data: {
      shopId, title: 'مانتو کتان', active: true,
      variants: { create: [{ size: '۳۸', color: 'کرم', price: 640000, stock: 2 }] },
    },
    include: { variants: true },
  });
  const channelCode = `t${Date.now().toString(36).slice(-6)}`;
  await prisma.channel.create({ data: { shopId, code: channelCode, botUsername: BOT_USERNAME } });
  seed = {
    shopId, userId: user.id, variantId: product.variants[0].id, channelCode,
    productId: product.id, secondProductId: product2.id, secondVariantId: product2.variants[0].id,
  };
});

after(async () => {
  if (server) await new Promise<void>(resolve => server.close(() => resolve()));
  if (prisma) await prisma.$disconnect();
});

/** هر اجرا بازه‌ی id متفاوتی می‌گیرد؛ جدول TelegramUpdate بین اجراها پاک نمی‌شود. */
let idSeq = 1_000_000 + Math.floor(Math.random() * 8_000_000);
function uid(): number { return idSeq++; }

function update(id: number, chatId: number, text: string, extra: { username?: string; firstName?: string; isBot?: boolean } = {}) {
  return {
    update_id: id,
    message: {
      message_id: id,
      date: Math.floor(Date.now() / 1000),
      text,
      chat: { id: chatId, type: 'private', username: extra.username, first_name: extra.firstName ?? 'مشتری' },
      from: { id: chatId, is_bot: extra.isBot ?? false, username: extra.username, first_name: extra.firstName },
    },
  };
}

function sends(chatId?: string) {
  return captured.filter(entry => entry.method === 'sendMessage' && (chatId === undefined || String(entry.body.chat_id) === chatId));
}

function reset() { captured = []; }

/** هر تستی که به «فروشنده‌ی وصل‌شده» نیاز دارد، خودش وضعیت را ست می‌کند. */
async function setOwnerChat(chatId: string) {
  await prisma.channel.update({ where: { shopId: seed.shopId }, data: { ownerChat: chatId, ownerLinkedAt: new Date(), ownerCode: null } });
}

describe('telegram client', () => {
  it('getMe نام بات را برمی‌گرداند (برای ساختن لینک t.me)', async () => {
    reset();
    const { TelegramClient, readTelegramConfig } = await import('../src/telegram/telegram.client');
    const identity = await new TelegramClient(readTelegramConfig()).getMe();
    assert.equal(identity.ok, true);
    assert.equal(identity.ok && identity.result.username, BOT_USERNAME);
    assert.equal(captured[0].method, 'getMe');
    assert.equal(captured[0].token, '123456:test-token');
  });

  it('setWebhook آدرس و سکرت را می‌فرستد', async () => {
    reset();
    const { TelegramClient, readTelegramConfig } = await import('../src/telegram/telegram.client');
    const result = await new TelegramClient(readTelegramConfig())
      .setWebhook('https://forooshyar-api.onrender.com/telegram/webhook/s', SECRET);
    assert.equal(result.ok, true);
    assert.equal(captured[0].body.url, 'https://forooshyar-api.onrender.com/telegram/webhook/s');
    assert.equal(captured[0].body.secret_token, SECRET);
  });

  it('پیام بلندتر از سقف تلگرام تکه می‌شود', async () => {
    const { splitMessage } = await import('../src/telegram/telegram.client');
    const parts = splitMessage('خط\n'.repeat(3000));
    assert.ok(parts.length > 1);
    for (const part of parts) assert.ok(part.length <= 4000, `بخش ${part.length} کاراکتری`);
  });

  it('بی‌توکن: configured=false و ارسال بی‌صدا رد می‌شود', async () => {
    const { TelegramClient, readTelegramConfig } = await import('../src/telegram/telegram.client');
    const client = new TelegramClient({ ...readTelegramConfig({}), token: '' });
    assert.equal(client.configured, false);
    const result = await client.sendMessage({ chat_id: '1', text: 'x' });
    assert.equal(result.ok, false);
  });
});

describe('channel webhook registration', () => {
  // این مسیر به دیتابیس دست نمی‌زند؛ پس بدون دیتابیس هم تست می‌شود.
  const audit = { record() {} } as never;
  const db = { channel: {} } as never;

  it('سرور خودش webhook را ثبت می‌کند و سکرت در پاسخ لو نمی‌رود', async () => {
    const { ChannelController } = await import('../src/telegram/channel.controller');
    const { TelegramService } = await import('../src/telegram/telegram.service');
    const controller = new ChannelController(db, new TelegramService(db, audit), audit);
    reset();
    const result = await controller.registerWebhook({
      host: 'forooshyar-api.onrender.com',
      'x-forwarded-proto': 'https',
    });

    assert.equal(result.ok, true);
    assert.equal(captured[0].method, 'setWebhook');
    assert.equal(captured[0].body.url, `https://forooshyar-api.onrender.com/telegram/webhook/${SECRET}`);
    assert.equal(captured[0].body.secret_token, SECRET);
    assert.ok(!result.url.includes(SECRET), 'سکرت نباید به پنل برگردد');
  });

  it('PUBLIC_API_URL بر هدرها اولویت دارد', async () => {
    const { TelegramService } = await import('../src/telegram/telegram.service');
    assert.equal(
      TelegramService.resolvePublicUrl({ host: 'internal:10000' }, { PUBLIC_API_URL: 'https://api.example.com/' } as NodeJS.ProcessEnv),
      'https://api.example.com',
    );
    assert.equal(
      TelegramService.resolvePublicUrl({ host: 'x', 'x-forwarded-host': 'api.example.com', 'x-forwarded-proto': 'https' }, {} as NodeJS.ProcessEnv),
      'https://api.example.com',
    );
  });

  it('آدرس http رد می‌شود (تلگرام فقط https می‌پذیرد)', async () => {
    const { ChannelController } = await import('../src/telegram/channel.controller');
    const { TelegramService } = await import('../src/telegram/telegram.service');
    const controller = new ChannelController(db, new TelegramService(db, audit), audit);
    const previous = process.env.PUBLIC_API_URL;
    process.env.PUBLIC_API_URL = 'http://insecure.local';
    try {
      await assert.rejects(() => controller.registerWebhook({}), /https/);
    } finally {
      process.env.PUBLIC_API_URL = previous;
    }
  });
});

function callbackUpdate(id: number, chatId: number, data: string) {
  return {
    update_id: id,
    callback_query: {
      id: `cb-${id}`,
      from: { id: chatId, is_bot: false, first_name: 'مشتری' },
      data,
      message: { message_id: id, chat: { id: chatId, type: 'private', first_name: 'مشتری' } },
    },
  };
}

/** یک گفتگوی مشتری آماده (از مسیر واقعی /start) برای تست‌های بعدی. */
async function joinedChat(chatId: number) {
  const result = await telegram.handleUpdate(update(uid(), chatId, `/start ${seed.channelCode}`) as never);
  assert.equal(result.status, 'handled');
  reset();
  return chatId;
}

describe('رفع ابهام و انتخاب محصول در بات', () => {
  it('بدون دیتابیس: skip', (t) => { if (!databaseReady) t.skip('DATABASE_URL/DB_* تنظیم نشده'); });

  it('«این مانتو چنده» → دو محصول و دکمه‌ی انتخاب، نه حدس', async (t) => {
    if (!databaseReady) return t.skip('no db');
    const chatId = await joinedChat(9101);
    const result = await telegram.handleUpdate(update(uid(), chatId, 'این مانتو چنده؟') as never);
    assert.equal(result.status, 'handled');
    assert.equal(result.status === 'handled' && result.kind, 'clarify');

    const [message] = sends('9101');
    assert.match(String(message.body.text), /بیش از یک محصول/);
    const markup = message.body.reply_markup as { inline_keyboard: { text: string; callback_data: string }[][] };
    const buttons = markup.inline_keyboard.flat();
    assert.equal(buttons.length, 2);
    assert.ok(buttons.every(button => button.callback_data.startsWith('p:')));
  });

  it('انتخاب محصول از دکمه → قیمت و موجودی و دکمه‌ی ثبت سفارش', async (t) => {
    if (!databaseReady) return t.skip('no db');
    const chatId = await joinedChat(9102);
    reset();
    const result = await telegram.handleUpdate(callbackUpdate(uid(), chatId, `p:${seed.secondProductId}`) as never);
    assert.equal(result.status, 'handled');
    const [message] = sends('9102');
    assert.match(String(message.body.text), /مانتو کتان/);
    assert.match(String(message.body.text), /کد محصول/);
    const markup = message.body.reply_markup as { inline_keyboard: { text: string; callback_data: string }[][] };
    assert.ok(markup.inline_keyboard.flat()[0].callback_data.startsWith('ord:'));
    // answerCallbackQuery صدا زده شده تا لودینگ دکمه بسته شود
    assert.ok(captured.some(entry => entry.method === 'answerCallbackQuery'));
  });

  it('پست فوروارد‌شده با زیرنویس → محصول از متن زیرنویس تشخیص داده می‌شود', async (t) => {
    if (!databaseReady) return t.skip('no db');
    const chatId = await joinedChat(9103);
    reset();
    const forwarded = {
      update_id: uid(),
      message: {
        message_id: 1,
        date: Math.floor(Date.now() / 1000),
        caption: 'مانتو کتان کرم قیمت ۶۴۰ هزار تومان',
        chat: { id: chatId, type: 'private' },
        from: { id: chatId, is_bot: false },
        forward_origin: { type: 'channel', chat: { title: 'کانال فروش تست' } },
        photo: [{ file_id: 'x' }],
      },
    };
    const result = await telegram.handleUpdate(forwarded as never);
    assert.equal(result.status, 'handled');
    assert.match(String(sends('9103')[0].body.text), /مانتو کتان/);
  });

  it('پست فوروارد‌شده‌ی بدون متن → پیام روشن، نه سکوت', async (t) => {
    if (!databaseReady) return t.skip('no db');
    const chatId = await joinedChat(9104);
    reset();
    const result = await telegram.handleUpdate({
      update_id: uid(),
      message: {
        message_id: 1, date: Math.floor(Date.now() / 1000),
        chat: { id: chatId, type: 'private' }, from: { id: chatId, is_bot: false },
        forward_origin: { type: 'channel', chat: { title: 'کانال تست' } }, photo: [{ file_id: 'x' }],
      },
    } as never);
    assert.equal(result.status === 'handled' && result.kind, 'forward_no_text');
    assert.match(String(sends('9104')[0].body.text), /متنی ندارد/);
  });
});

describe('سفارش کامل در بات', () => {
  it('بدون دیتابیس: skip', (t) => { if (!databaseReady) t.skip('DATABASE_URL/DB_* تنظیم نشده'); });

  it('مسیر کامل تا لینک پرداخت، رزرو موجودی، و اعلان فروشنده پس از پرداخت', async (t) => {
    if (!databaseReady) return t.skip('no db');
    process.env.PUBLIC_API_URL = 'https://api.test.local';
    await setOwnerChat('777');
    const chatId = await joinedChat(9201);

    // شروع سفارش با دکمه
    await telegram.handleUpdate(callbackUpdate(uid(), chatId, `ord:${seed.secondVariantId}`) as never);
    assert.match(String(sends('9201').at(-1)?.body.text), /چند عدد/);

    // تعداد
    await telegram.handleUpdate(callbackUpdate(uid(), chatId, 'flow:q:2') as never);
    assert.match(String(sends('9201').at(-1)?.body.text), /نام و نام خانوادگی/);

    // نام، موبایل، نشانی
    await telegram.handleUpdate(update(uid(), chatId, 'سارا محمدی') as never);
    await telegram.handleUpdate(update(uid(), chatId, '۰۹۱۲۳۴۵۶۷۸۹') as never);
    await telegram.handleUpdate(update(uid(), chatId, 'تهران، خیابان ولیعصر، پلاک ۱۲، کد پستی ۱۲۳۴۵۶۷۸۹۰') as never);
    assert.match(String(sends('9201').at(-1)?.body.text), /پیش‌فاکتور/);

    // تأیید → سفارش + لینک پرداخت
    const confirmed = await telegram.handleUpdate(callbackUpdate(uid(), chatId, 'flow:confirm') as never);
    assert.equal(confirmed.status === 'handled' && confirmed.kind, 'order_created');

    const payMessage = sends('9201').at(-1)!;
    const markup = payMessage.body.reply_markup as { inline_keyboard: { url: string }[][] };
    const payUrl = markup.inline_keyboard[0][0].url;
    assert.match(payUrl, /^https:\/\/api\.test\.local\/payments\/sandbox\/sbx_/);

    const order = await prisma.order.findFirst({ where: { shopId: seed.shopId }, orderBy: { createdAt: 'desc' }, include: { items: true } });
    assert.ok(order, 'سفارش باید ثبت شده باشد');
    assert.equal(order!.status, 'AWAITING_PAYMENT');
    assert.equal(order!.total, 640000 * 2);
    assert.equal(order!.items[0].quantity, 2);
    // موجودی رزرو شد: ۲ از ۲
    const variant = await prisma.variant.findUniqueOrThrow({ where: { id: seed.secondVariantId } });
    assert.equal(variant.stock, 0);

    // پرداخت در درگاه آزمایشی
    const authority = order!.paymentAuthority!;
    reset();
    const paid = await payments.confirmSandbox(authority, true);
    assert.equal(paid.ok, true);

    const after = await prisma.order.findUniqueOrThrow({ where: { id: order!.id } });
    assert.equal(after.status, 'PAID');
    assert.ok(after.paidAt);
    assert.ok(after.paymentRefId.length > 0);

    // اعلان‌ها: به مشتری و به فروشنده
    await new Promise(done => setTimeout(done, 50));
    assert.ok(sends('9201').some(entry => String(entry.body.text).includes('پرداخت شما تأیید شد')));
    assert.ok(sends('777').some(entry => String(entry.body.text).includes('سفارش پرداخت‌شده')), 'فروشنده باید اعلان بگیرد');

    // idempotent: پرداخت دوباره اعلان و تغییر وضعیت تکرار نمی‌کند
    reset();
    const again = await payments.confirmSandbox(authority, true);
    assert.equal(again.ok, true);
    assert.equal(again.ok && again.already, true);
    assert.equal(sends().length, 0, 'پرداخت تکراری نباید پیام تکراری بفرستد');
  });

  it('موجودی ناکافی → سفارش ثبت نمی‌شود و مشتری پیام روشن می‌گیرد', async (t) => {
    if (!databaseReady) return t.skip('no db');
    process.env.PUBLIC_API_URL = 'https://api.test.local';
    const chatId = await joinedChat(9202);

    // موجودی مانتو کتان ۰ شده (تست قبل)؛ دکمه‌ی سفارش دیگر نباید موجود باشد
    const result = await telegram.handleUpdate(callbackUpdate(uid(), chatId, `ord:${seed.secondVariantId}`) as never);
    assert.equal(result.status === 'handled' && result.kind, 'out_of_stock');
    assert.match(String(sends('9202').at(-1)?.body.text), /موجود نیست/);
  });

  it('لغو سفارش در میانه و /orders', async (t) => {
    if (!databaseReady) return t.skip('no db');
    const chatId = await joinedChat(9203);
    await telegram.handleUpdate(callbackUpdate(uid(), chatId, `ord:${seed.variantId}`) as never);
    await telegram.handleUpdate(callbackUpdate(uid(), chatId, 'flow:cancel') as never);
    assert.match(String(sends('9203').at(-1)?.body.text), /لغو شد/);

    const list = await telegram.handleUpdate(update(uid(), chatId, '/orders') as never);
    assert.equal(list.status, 'handled');
    assert.match(String(sends('9203').at(-1)?.body.text), /سفارش‌های شما|هنوز سفارشی/);
  });
});

describe('telegram webhook flow', () => {
  it('بدون دیتابیس: skip', (t) => { if (!databaseReady) t.skip('DATABASE_URL/DB_* تنظیم نشده'); });
  it('سکرت اشتباه → unauthorized و هیچ درخواستی به تلگرام نمی‌رود', async (t) => {
    if (!databaseReady) return t.skip('no db');
    const { TelegramWebhookController } = await import('../src/telegram/telegram.webhook.controller');
    const controller = new TelegramWebhookController(telegram);
    reset();
    const result = await controller.webhook('wrong', SECRET, update(uid(), 111, 'سلام') as never);
    assert.deepEqual(result, { ok: false, error: 'unauthorized' });
    assert.equal(sends().length, 0);
  });

  it('/start <code> مشتری را وصل می‌کند و خوش‌آمد می‌فرستد', async (t) => {
    if (!databaseReady) return t.skip('no db');
    reset();
    const result = await telegram.handleUpdate(update(uid(), 501, `/start ${seed.channelCode}`, { username: 'buyer1' }) as never);
    assert.equal(result.status, 'handled');
    assert.equal(sends('501').length, 1);
    const text = String(sends('501')[0].body.text);
    assert.match(text, /فروشگاه تست تلگرام/);
    const conversation = await prisma.telegramConversation.findFirst({ where: { shopId: seed.shopId, chatId: '501' } });
    assert.ok(conversation, 'گفتگو باید ثبت شده باشد');
  });

  it('سؤال قیمت → پاسخ از موجودی واقعی', async (t) => {
    if (!databaseReady) return t.skip('no db');
    reset();
    const result = await telegram.handleUpdate(update(uid(), 501, 'قیمت مانتو آبی سایز ۴۲ چنده؟') as never);
    assert.equal(result.status, 'handled');
    const text = String(sends('501')[0].body.text);
    assert.match(text, /۸۵۰٬۰۰۰|850,000/);
    assert.match(text, /مانتو آبی/);
  });

  it('سؤال ارسال → پاسخ از تنظیمات فروشگاه', async (t) => {
    if (!databaseReady) return t.skip('no db');
    reset();
    await telegram.handleUpdate(update(uid(), 501, 'ارسال چطوریه؟') as never);
    assert.match(String(sends('501')[0].body.text), /پست/);
  });

  it('موضوع نامطمئن → ارجاع به فروشنده و اعلان، ولی هیچ حدسی', async (t) => {
    if (!databaseReady) return t.skip('no db');
    const ownerChat = '9999';
    await setOwnerChat(ownerChat);
    reset();
    handoffUpdateId = uid();
    const result = await telegram.handleUpdate(update(handoffUpdateId, 501, 'می‌خوام مرجوع کنم') as never);
    assert.equal(result.kind, 'handoff');
    const replies = sends();
    assert.equal(replies.length, 2, 'یک پاسخ به مشتری و یک اعلان به فروشنده');
    assert.ok(replies.some(entry => String(entry.body.chat_id) === '501'));
    assert.ok(replies.some(entry => String(entry.body.chat_id) === ownerChat));
  });

  it('همان update_id دوباره → پاسخ تکراری نمی‌فرستد', async (t) => {
    if (!databaseReady) return t.skip('no db');
    reset();
    const result = await telegram.handleUpdate(update(handoffUpdateId, 501, 'می‌خوام مرجوع کنم') as never);
    assert.equal(result.status, 'duplicate');
    assert.equal(sends().length, 0);
  });

  it('چت فروشنده پاسخ خودکار مشتری نمی‌گیرد', async (t) => {
    if (!databaseReady) return t.skip('no db');
    reset();
    const result = await telegram.handleUpdate(update(uid(), 9999, 'موجودی مانتو آبی چنده؟') as never);
    assert.equal(result.status, 'handled');
    assert.equal(result.kind, 'no_conversation');
  });

  it('استیکر/عکس (بدون متن) نادیده گرفته می‌شود', async (t) => {
    if (!databaseReady) return t.skip('no db');
    reset();
    const result = await telegram.handleUpdate({ update_id: uid(), message: { message_id: 1, date: 1, chat: { id: 501 }, from: { id: 501 } } } as never);
    assert.deepEqual(result, { status: 'ignored', reason: 'unsupported_type' });
  });

  it('/link <code> فروشنده را وصل می‌کند و کد یک‌بارمصرف پاک می‌شود', async (t) => {
    if (!databaseReady) return t.skip('no db');
    const ownerCode = `oc${Math.random().toString(36).slice(2, 10)}`;
    await prisma.channel.update({ where: { shopId: seed.shopId }, data: { ownerChat: null, ownerLinkedAt: null, ownerCode } });
    reset();
    const result = await telegram.handleUpdate(update(uid(), 7777, `/link ${ownerCode}`) as never);
    assert.equal(result.kind, 'owner_linked');
    const channel = await prisma.channel.findUniqueOrThrow({ where: { shopId: seed.shopId } });
    assert.equal(channel.ownerChat, '7777');
    assert.equal(channel.ownerCode, null, 'کد باید مصرف شود');
    // همان کد دوباره کار نمی‌کند
    const again = await telegram.handleUpdate(update(uid(), 7778, `/link ${ownerCode}`) as never);
    assert.equal(again.kind, 'owner_code_invalid');
  });

  it('فروش → اعلان به فروشنده، با هشدار موجودی کم و تمام‌شدن', async (t) => {
    if (!databaseReady) return t.skip('no db');
    await setOwnerChat('7777');

    // موجودی معمولی: فقط اعلان فروش
    await prisma.variant.update({ where: { id: seed.variantId }, data: { stock: 10 } });
    reset();
    await telegram.notifySale(seed.shopId, seed.variantId, 2);
    let text = String(sends('7777')[0]?.body.text ?? '');
    assert.match(text, /فروش ثبت شد/);
    assert.match(text, /موجودی باقی‌مانده: ۱۰/);
    assert.doesNotMatch(text, /موجودی کم است|تمام شد/);

    // موجودی کم (آستانه ۳)
    await prisma.variant.update({ where: { id: seed.variantId }, data: { stock: 2 } });
    reset();
    await telegram.notifySale(seed.shopId, seed.variantId, 1);
    assert.match(String(sends('7777')[0]?.body.text ?? ''), /⚠️ موجودی کم است/);

    // تمام شده
    await prisma.variant.update({ where: { id: seed.variantId }, data: { stock: 0 } });
    reset();
    await telegram.notifySale(seed.shopId, seed.variantId, 2);
    assert.match(String(sends('7777')[0]?.body.text ?? ''), /❌ این محصول تمام شد/);

    // برگرداندن به حالت اول تا تست‌های دیگر به آن وابسته نباشند
    await prisma.variant.update({ where: { id: seed.variantId }, data: { stock: 5 } });
  });

  it('ownerChat خالی (فروشنده وصل نشده) اعلان نمی‌گیرد', async (t) => {
    if (!databaseReady) return t.skip('no db');
    await prisma.channel.update({ where: { shopId: seed.shopId }, data: { ownerChat: '', ownerLinkedAt: null } });
    reset();
    const ok = await telegram.notifyOwner(seed.shopId, 'سلام');
    assert.equal(ok, false);
    assert.equal(sends().length, 0);
  });

  it('خطای ارسال تلگرام، جریان را نمی‌شکند', async (t) => {
    if (!databaseReady) return t.skip('no db');
    reset();
    await setOwnerChat('7777');
    // پیامی که سرور جعلی برایش 403 برمی‌گرداند
    const ok = await telegram.notifyOwner(seed.shopId, 'FAIL_SEND');
    assert.equal(ok, false);
  });
});
