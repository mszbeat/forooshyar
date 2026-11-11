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

/**
 * جایگزین سرویس رخداد زنده.
 *
 * چرا لازم شد: `TelegramService` بعداً پارامتر ششم (`RealtimeService`) گرفت و
 * این تست آن را `undefined` می‌داد؛ نتیجه این بود که هر مسیری که سفارش می‌سازد
 * با «Cannot read properties of undefined (reading 'emitShop')» می‌شکست و تست
 * «سفارش کامل در بات» قرمز می‌شد. رفتار واقعی رخداد در تست لازم نیست، فقط
 * نباید بترکد.
 */
const realtimeStub = { emitShop: () => undefined, emitAdmin: () => undefined } as never;
const subscriptionStub = { status: async () => ({ active: true }), assertCanConnect: async () => undefined } as never;

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
  const { AiService } = await import('../src/ai/ai.service');
  // AuditService واقعی ولی بدون دیتابیس‌زدنِ اضافی: همان نسخه‌ای که در برنامه است
  const { AuditService } = await import('../src/logging/audit.service');
  const audit = new AuditService(prisma as never, false);
  // چرخه‌ی بات/سفارش در تست: اول بات با جای خالی، بعد سفارش، بعد وصل‌کردن.
  telegram = new TelegramService(prisma as never, audit, undefined as never, undefined as never, new AiService(), realtimeStub, subscriptionStub);
  const orders = new OrdersService(prisma as never, audit, telegram, realtimeStub);
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
    const { AiService } = await import('../src/ai/ai.service');
    const controller = new ChannelController(db, new TelegramService(db, audit, undefined as never, undefined as never, new AiService(), realtimeStub), audit, subscriptionStub);
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
    const { AiService } = await import('../src/ai/ai.service');
    const controller = new ChannelController(db, new TelegramService(db, audit, undefined as never, undefined as never, new AiService(), realtimeStub), audit, subscriptionStub);
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
    assert.match(String(message.body.text), /مرتبط پیدا شد/);
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

    // نام و موبایل
    await telegram.handleUpdate(update(uid(), chatId, 'سارا محمدی') as never);
    await telegram.handleUpdate(update(uid(), chatId, '۰۹۱۲۳۴۵۶۷۸۹') as never);
    assert.match(String(sends('9201').at(-1)?.body.text), /استان/, 'بعد از موبایل باید لیست استان بیاید');

    // استان و شهر با دکمه
    await telegram.handleUpdate(callbackUpdate(uid(), chatId, 'flow:prov:تهران') as never);
    assert.match(String(sends('9201').at(-1)?.body.text), /شهر در استان تهران/);
    await telegram.handleUpdate(callbackUpdate(uid(), chatId, 'flow:city:تهران') as never);

    // نشانی: خیابان، کوچه، پلاک، واحد، کد پستی
    await telegram.handleUpdate(update(uid(), chatId, 'خیابان ولیعصر') as never);
    await telegram.handleUpdate(update(uid(), chatId, 'کوچه بهار') as never);
    await telegram.handleUpdate(update(uid(), chatId, '۱۲') as never);
    await telegram.handleUpdate(update(uid(), chatId, '۳') as never);
    await telegram.handleUpdate(update(uid(), chatId, '۱۲۳۴۵۶۷۸۹۰') as never);
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
    // نشانی ساختیافته ذخیره شده و یک‌خطی‌اش هم ساخته شده
    assert.equal(order!.province, 'تهران');
    assert.equal(order!.city, 'تهران');
    assert.equal(order!.street, 'خیابان ولیعصر');
    assert.equal(order!.alley, 'کوچه بهار');
    assert.equal(order!.plaque, '12');
    assert.equal(order!.unit, '3');
    assert.equal(order!.postalCode, '1234567890');
    assert.match(order!.address, /تهران، تهران، خیابان ولیعصر، کوچه بهار، پلاک 12، واحد 3/);
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

/** پیام فروشنده (چت 777) که پاسخ روی یک پیام است. */
function sellerReplyUpdate(id: number, quoteText: string, text: string) {
  return {
    update_id: id,
    message: {
      message_id: id, date: Math.floor(Date.now() / 1000), text,
      chat: { id: 777, type: 'private' }, from: { id: 777, is_bot: false },
      reply_to_message: { message_id: id - 1, text: quoteText },
    },
  };
}

describe('پیام فروشنده به مشتری', () => {
  it('بدون دیتابیس: skip', (t) => { if (!databaseReady) t.skip('DATABASE_URL/DB_* تنظیم نشده'); });

  it('ارجاع به انسان، کد گفتگو و force_reply را برای فروشنده می‌فرستد', async (t) => {
    if (!databaseReady) return t.skip('no db');
    await setOwnerChat('777');
    const chatId = await joinedChat(9301);
    reset();
    await telegram.handleUpdate(update(uid(), chatId, 'می‌خوام مرجوع کنم پولمو پس بدید') as never);

    const owner = sends('777').at(-1)!;
    assert.match(String(owner.body.text), /#گفتگو [a-f0-9]{8}/);
    const markup = owner.body.reply_markup as { force_reply?: boolean };
    assert.equal(markup.force_reply, true, 'باید کادر پاسخ باز شود');

    // پیام مشتری در تاریخچه ثبت شده
    const conversation = await prisma.telegramConversation.findFirst({ where: { shopId: seed.shopId, chatId: String(chatId) } });
    const logged = await prisma.chatMessage.findFirst({ where: { shopId: seed.shopId, chatId: conversation!.chatId, direction: 'in' } });
    assert.ok(logged, 'پیام مشتری باید در تاریخچه باشد');
  });

  it('فروشنده با «پاسخ» روی همان اعلان، پیام را به مشتری می‌رساند', async (t) => {
    if (!databaseReady) return t.skip('no db');
    await setOwnerChat('777');
    const chatId = await joinedChat(9302);
    reset();
    // درخواست صریح «با یک آدم حرف بزنم» → همان لحظه به فروشنده وصل می‌شود.
    await telegram.handleUpdate(update(uid(), chatId, 'می‌شه با مدیر صحبت کنم؟') as never);
    const notice = String(sends('777').at(-1)!.body.text);
    const code = /#گفتگو ([a-f0-9]{8})/.exec(notice)?.[1];
    assert.ok(code, 'کد گفتگو باید در اعلان باشد');

    reset();
    const result = await telegram.handleUpdate(sellerReplyUpdate(uid(), notice, 'بله سایز بزرگ موجوده، همین امروز می‌فرستیم.') as never);
    assert.equal(result.status === 'handled' && result.kind, 'seller_reply');

    const toCustomer = sends('9302').at(-1)!;
    assert.match(String(toCustomer.body.text), /پاسخ فروشنده/);
    assert.match(String(toCustomer.body.text), /سایز بزرگ موجوده/);

    // فروشنده نباید پاسخ خودکار بگیرد
    assert.equal(sends('777').length, 0);

    const out = await prisma.chatMessage.findFirst({ where: { shopId: seed.shopId, direction: 'out' }, orderBy: { createdAt: 'desc' } });
    assert.ok(out, 'پیام فروشنده باید در تاریخچه ثبت شود');
    assert.match(out!.text, /سایز بزرگ موجوده/);
  });

  it('دستور /reply با کد گفتگو و پیام چندکلمه‌ای', async (t) => {
    if (!databaseReady) return t.skip('no db');
    await setOwnerChat('777');
    const chatId = await joinedChat(9303);
    reset();
    await telegram.handleUpdate(update(uid(), chatId, 'سلام') as never);
    const code = /#گفتگو ([a-f0-9]{8})/.exec(String(sends('777').at(-1)?.body.text ?? ''))?.[1]
      ?? (await prisma.telegramConversation.findFirst({ where: { shopId: seed.shopId, chatId: String(chatId) } }))!.id.replace(/-/g, '').slice(0, 8);

    reset();
    const result = await telegram.handleUpdate(update(uid(), 777, `/reply ${code} بله موجود است`) as never);
    assert.equal(result.status === 'handled' && result.kind, 'seller_reply');
    assert.match(String(sends('9303').at(-1)?.body.text), /بله موجود است/);
  });

  it('/reply با کد ناموجود → پیام روشن، بدون ارسال', async (t) => {
    if (!databaseReady) return t.skip('no db');
    await setOwnerChat('777');
    reset();
    const result = await telegram.handleUpdate(update(uid(), 777, '/reply deadbeef متن') as never);
    assert.equal(result.status === 'handled' && result.kind, 'chat_not_found');
    assert.equal(sends('777').length, 1);
    assert.equal(captured.filter(entry => entry.method === 'sendMessage' && String(entry.body.chat_id) !== '777').length, 0);
  });

  it('پیام بدون پاسخ به اعلان → راهنما، نه ارسال کورکورانه', async (t) => {
    if (!databaseReady) return t.skip('no db');
    await setOwnerChat('777');
    reset();
    const result = await telegram.handleUpdate(update(uid(), 777, 'سلام یه سوال داشتم') as never);
    assert.equal(result.status === 'handled' && result.kind, 'seller_hint');
    assert.equal(captured.filter(entry => entry.method === 'sendMessage' && String(entry.body.chat_id) !== '777').length, 0);
  });

  it('ارسال از پنل: پیام به مشتری می‌رود و در تاریخچه می‌نشیند', async (t) => {
    if (!databaseReady) return t.skip('no db');
    process.env.PUBLIC_API_URL = 'https://api.test.local';
    const chatId = await joinedChat(9304);
    // ساخت یک سفارش واقعی برای گرفتن chatId
    await telegram.handleUpdate(callbackUpdate(uid(), chatId, `ord:${seed.variantId}`) as never);
    await telegram.handleUpdate(callbackUpdate(uid(), chatId, 'flow:q:1') as never);
    await telegram.handleUpdate(update(uid(), chatId, 'سارا محمدی') as never);
    await telegram.handleUpdate(update(uid(), chatId, '09121234567') as never);
    await telegram.handleUpdate(callbackUpdate(uid(), chatId, 'flow:prov:فارس') as never);
    await telegram.handleUpdate(callbackUpdate(uid(), chatId, 'flow:city:شیراز') as never);
    await telegram.handleUpdate(update(uid(), chatId, 'خیابان زند') as never);
    await telegram.handleUpdate(callbackUpdate(uid(), chatId, 'flow:alley:none') as never);
    await telegram.handleUpdate(update(uid(), chatId, '5') as never);
    await telegram.handleUpdate(callbackUpdate(uid(), chatId, 'flow:unit:none') as never);
    await telegram.handleUpdate(callbackUpdate(uid(), chatId, 'flow:postal:skip') as never);
    await telegram.handleUpdate(callbackUpdate(uid(), chatId, 'flow:confirm') as never);

    const order = await prisma.order.findFirst({ where: { shopId: seed.shopId, chatId: String(chatId) }, orderBy: { createdAt: 'desc' } });
    assert.ok(order, 'سفارش باید ساخته شده باشد');
    assert.equal(order!.city, 'شیراز');
    assert.equal(order!.unit, 'ندارد');
    assert.equal(order!.postalCode, '', 'کد پستی رد شده');

    reset();
    const { OrdersService } = await import('../src/orders/orders.service');
    const { AuditService } = await import('../src/logging/audit.service');
    const orders = new OrdersService(prisma as never, new AuditService(prisma as never, false), telegram, realtimeStub);
    const history = await orders.sendMessage(seed.shopId, order!.id, 'سفارشتون فردا ارسال می‌شه 🌷');

    assert.ok(history.length >= 1, 'تاریخچه باید پیام فروشنده را داشته باشد');
    assert.equal(history.at(-1)!.direction, 'out');
    assert.equal(history.at(-1)!.orderId, order!.id);
    assert.match(String(sends('9304').at(-1)?.body.text), /سفارشتون فردا ارسال می‌شه/);
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
    // خوش‌آمد به‌همراه پیام/کیبورد راهنما می‌آید؛ سقف سخت اینجا معنا ندارد و
    // قبلاً با اضافه‌شدن کیبورد پایین چت، تست بی‌دلیل قرمز شد. مهم این است که
    // دست‌کم یک پیام رفته باشد و نام فروشگاه در آن باشد.
    const welcomes = sends('501').map(item => String(item.body.text ?? ''));
    assert.ok(welcomes.length >= 1, 'هیچ پیامی برای مشتری نرفت');
    assert.ok(welcomes.some(item => /فروشگاه تست تلگرام/u.test(item)), 'نام فروشگاه در پیام خوش‌آمد نبود');
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

  it('جمله‌ی نامفهوم → اول سؤال روشن‌کننده با دکمه، بعد از ۳ بار ارجاع به فروشنده', async (t) => {
    if (!databaseReady) return t.skip('no db');
    const ownerChat = '9999';
    await setOwnerChat(ownerChat);
    const chatId = await joinedChat(9501);

    // ۱) بار اول: هیچ ارجاعی نمی‌شود؛ سؤال روشن‌کننده با دکمه می‌آید.
    reset();
    const first = await telegram.handleUpdate(update(uid(), chatId, 'بلابلا زیرو') as never);
    assert.equal(first.kind, 'clarify', 'اول باید سؤال کند، نه ارجاع');
    assert.equal(sends(ownerChat).length, 0, 'هنوز نباید به فروشنده پیام برود');
    const clarifyMessage = sends(String(chatId)).at(-1)!;
    assert.ok((clarifyMessage.body.reply_markup as { inline_keyboard?: unknown[] }).inline_keyboard?.length, 'دکمه‌ی گزینه‌ها لازم است');

    // ۲) دو پیام نامفهوم دیگر
    await telegram.handleUpdate(update(uid(), chatId, 'قققق') as never);
    await telegram.handleUpdate(update(uid(), chatId, 'ژژژژ') as never);

    // ۳) بار چهارم: بات قبول می‌کند که نفهمیده و به انسان وصل می‌کند.
    reset();
    handoffUpdateId = uid();
    const result = await telegram.handleUpdate(update(handoffUpdateId, chatId, 'خخخخ') as never);
    assert.equal(result.kind, 'handoff');
    const notice = sends(ownerChat).at(-1)!;
    assert.match(String(notice.body.text), /#گفتگو [a-f0-9]{8}/);
    assert.match(String(notice.body.text), /نفهمید|پاسخ انسانی/);
  });

  it('همان update_id دوباره → پاسخ تکراری نمی‌فرستد', async (t) => {
    if (!databaseReady) return t.skip('no db');
    reset();
    const result = await telegram.handleUpdate(update(handoffUpdateId, 501, 'می‌خوام مرجوع کنم') as never);
    assert.equal(result.status, 'duplicate');
    assert.equal(sends().length, 0);
  });

  it('چت فروشنده پاسخ خودکار مشتری نمی‌گیرد (راهنمای پاسخ می‌گیرد)', async (t) => {
    if (!databaseReady) return t.skip('no db');
    await setOwnerChat('9999');
    reset();
    const result = await telegram.handleUpdate(update(uid(), 9999, 'موجودی مانتو آبی چنده؟') as never);
    assert.equal(result.status, 'handled');
    // مهم این است که بات قیمت/موجودی را به «فروشنده» جواب نمی‌دهد و پیام او را
    // هم به مشتری نمی‌فرستد؛ در عوض راهنمای پاسخ به مشتری می‌دهد.
    assert.equal(result.status === 'handled' ? result.kind : '', 'seller_hint');
    const text = String(sends('9999').at(-1)?.body.text);
    assert.doesNotMatch(text, /۸۵۰٬۰۰۰|موجودی و قیمت/);
    assert.match(text, /پاسخ/);
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

describe('«اگر موجود شد خبرم کن» و ریپلای', () => {
  it('کلیک روی دکمه‌ی خبر، درخواست را ثبت می‌کند و بعد از شارژ موجودی پیام می‌رود', async (t) => {
    if (!databaseReady) return t.skip('no db');
    const chatId = await joinedChat(9201);
    reset();

    const conversation = await prisma.telegramConversation.findFirstOrThrow({ where: { chatId: String(chatId), shopId: seed.shopId } });
    const shopId = conversation.shopId;
    // گفتگو باید از حالت «انتخاب از فهرست» بیرون بیاید، وگرنه پاسخ به‌عنوان
    // ادامه‌ی همان فهرست تفسیر می‌شود. هم‌چنین محصول هم‌نامِ اجرای قبلی پاک شود.
    await prisma.telegramConversation.update({
      where: { id: conversation.id },
      data: { clarify: null, draft: null },
    });
    const title = 'کوله تست واچ';
    const stale = await prisma.product.findMany({ where: { shopId, title }, select: { id: true } });
    for (const old of stale) {
      await prisma.stockAlert.deleteMany({ where: { productId: old.id } });
      await prisma.stockMovement.deleteMany({ where: { productId: old.id } });
      await prisma.variant.deleteMany({ where: { productId: old.id } });
      await prisma.product.delete({ where: { id: old.id } });
    }
    const product = await prisma.product.create({
      data: {
        shopId, title, active: true,
        variants: { create: [{ size: 'یک‌سایز', color: 'مشکی', price: 900000, stock: 0 }] },
      },
      include: { variants: true },
    });

    const ask = await telegram.handleUpdate(update(uid(), chatId, `قیمت ${title} چنده؟`) as never);
    assert.equal(ask.status, 'handled');
    const askText = String(sends(String(chatId))[0].body.text);
    assert.match(askText, /تمام شده/);
    const keyboard = JSON.stringify(sends(String(chatId))[0].body.reply_markup);
    assert.match(keyboard, new RegExp(`watch:${product.id}`));

    reset();
    const watch = await telegram.handleUpdate({
      update_id: Math.floor(Math.random() * 1e9),
      callback_query: {
        id: 'cb-watch', from: { id: Number(chatId), is_bot: false }, data: `watch:${product.id}`,
        message: { message_id: 1, chat: { id: Number(chatId), type: 'private' } },
      },
    } as never);
    assert.equal(watch.status, 'handled');
    assert.match(String(sends(String(chatId))[0].body.text), /ثبت شد/);

    // شارژ موجودی → پیام «دوباره موجود شد»
    await prisma.variant.updateMany({ where: { productId: product.id }, data: { stock: 5 } });
    reset();
    const notified = await telegram.notifyRestock(shopId, product.id);
    assert.equal(notified, 1);
    assert.match(String(sends(String(chatId))[0].body.text), /دوباره موجود شد/);

    // بار دوم نباید دوباره پیام بدهد
    reset();
    assert.equal(await telegram.notifyRestock(shopId, product.id), 0);
  });

  it('ریپلای مشتری روی پیام فروشنده در تاریخچه حفظ می‌شود', async (t) => {
    if (!databaseReady) return t.skip('no db');
    const chatId = await joinedChat(9202);
    reset();
    await telegram.handleUpdate({
      update_id: Math.floor(Math.random() * 1e9),
      message: {
        message_id: 5, date: Math.floor(Date.now() / 1000),
        text: 'این یکی رو می‌خوام',
        chat: { id: chatId, type: 'private' }, from: { id: chatId, is_bot: false },
        reply_to_message: { message_id: 4, text: 'کوله تست ۹۰۰٬۰۰۰ تومان', from: { id: 1, is_bot: true } },
      },
    } as never);
    const conversation = await prisma.telegramConversation.findFirstOrThrow({ where: { chatId: String(chatId), shopId: seed.shopId } });
    const saved = await prisma.chatMessage.findFirst({
      where: { shopId: conversation.shopId, chatId: String(chatId), direction: 'in' },
      orderBy: { createdAt: 'desc' },
    });
    assert.equal(saved?.replyFrom, 'out');
    assert.match(String(saved?.replyText), /۹۰۰٬۰۰۰/);
  });
});
