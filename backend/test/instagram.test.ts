/**
 * تست اینستاگرام (BoxAPI) بدون شبکه‌ی واقعی و بدون توکن واقعی.
 *
 * مثل تست تلگرام: یک سرور HTTP جعلی نقش `api.sendbox.chat` را بازی می‌کند و
 * هر درخواست `/service/actions/<اکشن>` را ثبت می‌کند. امضا هم با همان تابعی
 * ساخته می‌شود که سرور استفاده می‌کند تا «همان چیزی که می‌فرستیم» تست شود، نه
 * یک رشته‌ی دستی.
 *
 * بخش‌های دیتابیسی وقتی `DATABASE_URL` نباشد skip می‌شوند.
 */
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { after, before, describe, it } from 'node:test';
import { verifySignature, signPayload } from '../src/instagram/signature';
import { toPlainText, toInstagramActions, splitInstagramMessage } from '../src/instagram/format';
import { InstagramClient } from '../src/instagram/instagram.client';

type Captured = { action: string; body: Record<string, unknown>; apiKey: string };

const API_KEY = 'test-api-key-123';
const ACCOUNT_ID = '11111111-2222-3333-4444-555555555555';
const WEBHOOK_SECRET = 'test-webhook-secret';

let server: Server;
let databaseReady = false;
let prisma: import('@prisma/client').PrismaClient;
let service: import('../src/instagram/instagram.service').InstagramService;
let seed: { shopId: string; variantId: string; productId: string; channelCode: string };
let captured: Captured[] = [];

function reset() { captured = []; }

before(async () => {
  // ---- سرور جعلی BoxAPI ---------------------------------------------------
  server = createServer((request, response) => {
    let raw = '';
    request.on('data', chunk => { raw += chunk; });
    request.on('end', () => {
      const match = /^\/api\/v1\/service\/actions\/(\w+)$/.exec(request.url ?? '');
      if (!match) {
        response.statusCode = 404;
        response.end('{}');
        return;
      }
      const body = raw ? JSON.parse(raw) as Record<string, unknown> : {};
      captured.push({ action: match[1], body, apiKey: String(request.headers['x-api-key'] ?? '') });

      const respond = (payload: unknown, status = 200) => {
        response.statusCode = status;
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify(payload));
      };
      if (String(body.message ?? '').includes('FAIL_SEND')) {
        return respond({ ok: false, message: 'recipient not reachable' }, 200);
      }
      return respond({ ok: true, message_id: `mid_${captured.length}` });
    });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}/api/v1`;

  process.env.INSTAGRAM_BASE_URL = base;
  process.env.INSTAGRAM_API_KEY = API_KEY;
  process.env.INSTAGRAM_ACCOUNT_ID = ACCOUNT_ID;
  process.env.INSTAGRAM_WEBHOOK_SECRET = WEBHOOK_SECRET;
  process.env.INSTAGRAM_LOGIN_URL = 'https://api.sendbox.chat/instagram-oauth?token=demo';
  process.env.PUBLIC_API_URL = 'https://api.example.test';

  // ---- دیتابیس ------------------------------------------------------------
  const { PrismaClient } = await import('@prisma/client');
  const { databaseUrl } = await import('../src/config');
  const url = databaseUrl(process.env);
  if (!url) return;
  prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    await prisma.$queryRaw`SELECT 1`;
    databaseReady = true;
  } catch { databaseReady = false; return; }

  const { InstagramService } = await import('../src/instagram/instagram.service');
  const { OrdersService } = await import('../src/orders/orders.service');
  const { PaymentsService } = await import('../src/payments/payments.service');
  const { TelegramService } = await import('../src/telegram/telegram.service');
  const { AiService } = await import('../src/ai/ai.service');
  const { AuditService } = await import('../src/logging/audit.service');
  const audit = new AuditService(prisma as never, false);
  // جایگزین سرویس رخداد زنده: در تست رفتار واقعی SSE لازم نیست، فقط نباید بترکد.
  const realtimeStub = { emitShop: () => undefined, emitAdmin: () => undefined } as never;
  const telegram = new TelegramService(prisma as never, audit, undefined as never, undefined as never, new AiService(), realtimeStub);
  const orders = new OrdersService(prisma as never, audit, telegram, realtimeStub);
  const payments = new PaymentsService(orders);
  Object.assign(telegram as unknown as Record<string, unknown>, { orders, payments });

  // اتصال حساب از اجرای قبلی آزاد می‌شود؛ وگرنه پیام‌ها به فروشگاه قدیمی
  // (که هنوز در دیتابیس تست است) می‌رود و تست بی‌دلیل قرمز می‌شود.
  await prisma.channel.updateMany({
    where: { instagramAccountId: ACCOUNT_ID },
    data: { instagramAccountId: null, instagramLinkedAt: null, instagramUsername: null },
  });

  // داده‌ی تست
  const user = await prisma.user.create({
    data: {
      email: `ig-${Date.now()}@example.com`,
      passwordHash: 'x',
      shop: { create: { name: 'فروشگاه تست اینستاگرام', shipping: 'ارسال با پست، ۲ تا ۴ روز کاری.', workingHours: 'هر روز ۹ تا ۱۸.' } },
    },
    include: { shop: true },
  });
  const shopId = user.shop!.id;
  const product = await prisma.product.create({
    data: {
      shopId, title: 'مانتو کتان تابستانه', active: true,
      variants: { create: [{ size: 'M', color: 'کرم', price: 890000, stock: 7 }] },
    },
    include: { variants: true },
  });
  const channelCode = `ig${Date.now().toString(36).slice(-6)}`;
  await prisma.channel.create({ data: { shopId, code: channelCode } });
  // در حالت تک‌فروشگاهی، پیام حساب ناشناس به فروشگاه پیش‌فرض وصل می‌شود.
  process.env.INSTAGRAM_SHOP_CODE = channelCode;

  seed = { shopId, variantId: product.variants[0].id, productId: product.id, channelCode };
  service = new InstagramService(prisma as never, audit, realtimeStub, new AiService(), orders, payments, telegram);
});

after(async () => {
  if (server) await new Promise<void>(resolve => server.close(() => resolve()));
  if (prisma) await prisma.$disconnect();
});

/** رویداد تازه با شناسه‌ی یکتا؛ جدول InstagramEvent بین اجراها پاک نمی‌شود. */
function event(body: { text?: string; payload?: string; senderId?: string; echo?: boolean; eventId?: string }) {
  const senderId = body.senderId ?? `1784${Math.floor(Math.random() * 1_000_000_000)}`;
  const messaging: Record<string, unknown> = {
    sender: { id: senderId, name: 'سارا' },
    recipient: { id: ACCOUNT_ID },
    timestamp: Date.now(),
  };
  if (body.payload) messaging.postback = { title: 'انتخاب', payload: body.payload };
  else messaging.message = { mid: `mid_${Math.random()}`, text: body.text ?? '', is_echo: body.echo ?? false };

  return {
    event_id: body.eventId ?? `evt_${Math.random().toString(36).slice(2)}`,
    event_type: body.payload ? 'messaging_postbacks' : 'messaging',
    account_id: ACCOUNT_ID,
    data: { messaging: [messaging] },
  };
}

describe('امضای webhook', () => {
  it('امضای درست پذیرفته می‌شود', () => {
    const now = Date.now();
    const timestamp = String(Math.floor(now / 1000));
    const raw = '{"event_id":"e1","event_type":"messaging"}';
    const signature = signPayload(WEBHOOK_SECRET, timestamp, raw);
    const result = verifySignature({ rawBody: raw, signature, timestamp, secret: WEBHOOK_SECRET, nowMs: now });
    assert.deepEqual(result, { ok: true, enforced: true });
  });

  it('بدنه‌ی دستکاری‌شده رد می‌شود', () => {
    const now = Date.now();
    const timestamp = String(Math.floor(now / 1000));
    const signature = signPayload(WEBHOOK_SECRET, timestamp, '{"a":1}');
    const result = verifySignature({ rawBody: '{"a":2}', signature, timestamp, secret: WEBHOOK_SECRET, nowMs: now });
    assert.equal(result.ok, false);
  });

  it('مهر زمانی قدیمی رد می‌شود (پنجره‌ی ۳۰۰ ثانیه)', () => {
    const old = Date.now() - 400_000;
    const timestamp = String(Math.floor(old / 1000));
    const raw = '{}';
    const signature = signPayload(WEBHOOK_SECRET, timestamp, raw);
    const result = verifySignature({ rawBody: raw, signature, timestamp, secret: WEBHOOK_SECRET });
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.reason, 'stale_timestamp');
  });

  it('بدون سکرت، امضا تحمیل نمی‌شود', () => {
    const result = verifySignature({ rawBody: '{}', secret: '' });
    assert.deepEqual(result, { ok: true, enforced: false });
  });

  it('مهر زمانی غیرعددی رد می‌شود', () => {
    const result = verifySignature({ rawBody: '{}', signature: 'sha256=aa', timestamp: 'abc', secret: WEBHOOK_SECRET });
    assert.equal(result.ok === false && result.reason, 'bad_timestamp');
  });
});

describe('تبدیل قالب برای دایرکت', () => {
  it('تگ‌های HTML و موجودیت‌ها پاک می‌شوند', () => {
    assert.equal(toPlainText('<b>سلام</b> &amp; خداحافظ'), 'سلام & خداحافظ');
    assert.equal(toPlainText('خط یک<br>خط دو'), 'خط یک\nخط دو');
  });

  it('تا سه دکمه → دکمه‌ی واقعی، بیشتر → پاسخ سریع', () => {
    const two = toInstagramActions([[{ text: 'اول', data: 'p:1' }], [{ text: 'دوم', url: 'https://x.test' }]]);
    assert.equal(two.buttons?.length, 2);
    assert.equal(two.buttons?.[1].type, 'web_url');
    assert.equal(two.quickReplies, undefined);

    const many = toInstagramActions(Array.from({ length: 6 }, (_, index) => [{ text: `گزینه ${index}`, data: `p:${index}` }]));
    assert.equal(many.buttons, undefined);
    assert.equal(many.quickReplies?.length, 6);
  });

  it('عنوان دکمه از ۲۰ کاراکتر رد نمی‌شود', () => {
    const actions = toInstagramActions([[{ text: '۱ مانتو کتان تابستانه بلند و کشیده', data: 'p:1' }]]);
    assert.ok((actions.buttons?.[0].title.length ?? 0) <= 20);
  });

  it('متن بلند روی مرز خط شکسته می‌شود', () => {
    const line = 'الف'.repeat(600);
    const parts = splitInstagramMessage(`${line}\n${line}\n${line}`);
    assert.ok(parts.length >= 2);
    for (const part of parts) assert.ok(part.length <= 1000);
  });
});

describe('کلاینت BoxAPI', () => {
  it('درخواست با هدر X-Api-Key و account_id می‌رود', async () => {
    reset();
    const client = new InstagramClient({
      baseUrl: process.env.INSTAGRAM_BASE_URL!, apiKey: API_KEY, webhookSecret: WEBHOOK_SECRET,
      accountId: ACCOUNT_ID, loginUrl: '', shopCode: '', timeoutMs: 5000, profileUrl: '',
    });
    const result = await client.sendMessage({ recipientId: '17840001', message: 'سلام' });
    assert.equal(result.ok, true);
    assert.equal(captured.length, 1);
    assert.equal(captured[0].action, 'send_message');
    assert.equal(captured[0].apiKey, API_KEY);
    assert.equal(captured[0].body.account_id, ACCOUNT_ID);
    assert.equal(captured[0].body.recipient_id, '17840001');
  });

  it('خطای منطقی BoxAPI موفق حساب نمی‌شود', async () => {
    const client = new InstagramClient({
      baseUrl: process.env.INSTAGRAM_BASE_URL!, apiKey: API_KEY, webhookSecret: WEBHOOK_SECRET,
      accountId: ACCOUNT_ID, loginUrl: '', shopCode: '', timeoutMs: 5000, profileUrl: '',
    });
    const result = await client.sendMessage({ recipientId: '17840001', message: 'FAIL_SEND' });
    assert.equal(result.ok, false);
  });

  it('بدون توکن هیچ درخواستی نمی‌رود', async () => {
    reset();
    const client = new InstagramClient({
      baseUrl: process.env.INSTAGRAM_BASE_URL!, apiKey: '', webhookSecret: '', accountId: ACCOUNT_ID,
      loginUrl: '', shopCode: '', timeoutMs: 5000, profileUrl: '',
    });
    const result = await client.sendMessage({ recipientId: '17840001', message: 'سلام' });
    assert.equal(result.ok, false);
    assert.equal(captured.length, 0);
  });
});

describe('جریان پیام اینستاگرام', () => {
  it('پیام مشتری → پاسخ بات در دایرکت + ثبت در تاریخچه', async t => {
    if (!databaseReady) return t.skip('DATABASE_URL لازم است');
    reset();
    const senderId = `1784${Date.now() % 1_000_000}`;
    const result = await service.handleWebhook(event({ text: 'قیمت مانتو کتان تابستانه چند است؟', senderId }));
    assert.equal(result.status, 'handled');
    assert.ok(captured.some(item => item.action === 'send_message' && item.body.recipient_id === senderId));

    const chatId = `ig:${senderId}`;
    const messages = await prisma.chatMessage.findMany({ where: { shopId: seed.shopId, chatId }, orderBy: { createdAt: 'asc' } });
    assert.equal(messages[0].direction, 'in');
    assert.equal(messages[0].text, 'قیمت مانتو کتان تابستانه چند است؟');
    assert.ok(messages.some(item => item.direction === 'out'));
  });

  it('همان event_id دوباره پردازش نمی‌شود', async t => {
    if (!databaseReady) return t.skip('DATABASE_URL لازم است');
    const payload = event({ text: 'سلام' });
    const first = await service.handleWebhook(payload);
    reset();
    const second = await service.handleWebhook(payload);
    assert.equal(first.status, 'handled');
    assert.equal(second.status, 'duplicate');
    assert.equal(captured.length, 0);
  });

  it('اکوی پیام خود پیج نادیده گرفته می‌شود', async t => {
    if (!databaseReady) return t.skip('DATABASE_URL لازم است');
    reset();
    const result = await service.handleWebhook(event({ text: 'پیام خودمان', echo: true }));
    assert.equal(result.status, 'ignored');
    assert.equal(captured.length, 0);
  });

  it('دکمه‌ی «ثبت سفارش» مرحله‌ی اول سفارش را می‌فرستد', async t => {
    if (!databaseReady) return t.skip('DATABASE_URL لازم است');
    reset();
    const result = await service.handleWebhook(event({ payload: `ord:${seed.variantId}` }));
    assert.equal(result.status, 'handled');
    const sent = captured.find(item => item.action === 'send_message');
    assert.ok(sent, 'پیام مرحله‌ی سفارش ارسال نشد');
    assert.match(String(sent!.body.message), /سفارش/u);
  });

  it('وضعیت اتصال، توکن را برنمی‌گرداند', async t => {
    if (!databaseReady) return t.skip('DATABASE_URL لازم است');
    const status = await service.status(seed.shopId);
    const serialized = JSON.stringify(status);
    assert.equal(status.configured, true);
    assert.ok(!serialized.includes(API_KEY), 'توکن در پاسخ وضعیت لو رفت');
    assert.ok(!serialized.includes(WEBHOOK_SECRET), 'سکرت در پاسخ وضعیت لو رفت');
    assert.equal(status.webhookUrl, 'https://api.example.test/webhooks/instagram');
    assert.equal(status.signatureEnforced, true);
    assert.ok(status.accountLinked, 'حساب به فروشگاه وصل نشده است');
  });

  it('پاسخ فروشنده از پنل به دایرکت می‌رود', async t => {
    if (!databaseReady) return t.skip('DATABASE_URL لازم است');
    reset();
    const chatId = `ig:1784999${Date.now() % 1000}`;
    await prisma.telegramConversation.create({ data: { shopId: seed.shopId, chatId, firstName: 'سارا' } });
    const sent = await service.sendFromPanel(seed.shopId, chatId, 'سلام، موجود است.');
    assert.equal(sent.ok, true);
    const capturedSend = captured.find(item => item.action === 'send_message');
    assert.ok(capturedSend);
    assert.equal(capturedSend!.body.recipient_id, chatId.slice(3));
  });
});
