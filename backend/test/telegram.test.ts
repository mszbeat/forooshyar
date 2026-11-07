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
let seed: { shopId: string; userId: string; variantId: string; channelCode: string };
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
  // AuditService واقعی ولی بدون دیتابیس‌زدنِ اضافی: همان نسخه‌ای که در برنامه است
  const { AuditService } = await import('../src/logging/audit.service');
  const audit = new AuditService(prisma as never, false);
  telegram = new TelegramService(prisma as never, audit);

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
  const channelCode = `t${Date.now().toString(36).slice(-6)}`;
  await prisma.channel.create({ data: { shopId, code: channelCode, botUsername: BOT_USERNAME } });
  seed = { shopId, userId: user.id, variantId: product.variants[0].id, channelCode };
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
