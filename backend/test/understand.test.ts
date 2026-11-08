import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { composeReply, type BrainShop } from '../src/telegram/brain';
import { resolveReply } from '../src/ai/understand';
import { suggest, type CatalogProduct } from '../src/catalog/discovery';
import type { AiService } from '../src/ai/ai.service';

/**
 * رگرسیونِ باگ گزارش‌شده: «می‌خوام قیمت کفش هاتون رو بدونم» در فروشگاهی که
 * «روسری ابریشم» و «کفش لوفر» دارد، پاسخ «محصولی با عنوان … نیست» + پیشنهاد
 * «روسری» می‌گرفت. این تست سه لایه را قفل می‌کند: پاک‌سازی واژه‌های گفتاری،
 * آستانه‌ی شباهت پیشنهاد، و تشخیص نیت با مدل.
 */

const PRODUCTS: CatalogProduct[] = [
  { id: 'aaaaaa11-1111-1111-1111-111111111111', title: 'روسری ابریشم مدل ستاره', variants: [
    { id: 'v1', size: '', color: 'صورتی', price: 380_000, stock: 4 },
  ] },
  { id: 'bbbbbb22-2222-2222-2222-222222222222', title: 'کفش لوفر چرم مشکی', variants: [
    { id: 'v2', size: '41', color: 'مشکی', price: 1_850_000, stock: 2 },
  ] },
  { id: 'cccccc33-3333-3333-3333-333333333333', title: 'شال نخی تابستانی', variants: [
    { id: 'v3', size: '', color: 'آبی', price: 420_000, stock: 1 },
  ] },
];

const SHOP: BrainShop = {
  name: 'بوتیک باران',
  shipping: 'پست پیشتاز، ۲ تا ۴ روز کاری.',
  payment: 'پرداخت آنلاین یا کارت به کارت.',
  workingHours: 'هر روز ۹ تا ۲۳.',
  returns: 'تا ۷ روز مرجوعی.',
  handoffMessage: 'برای پاسخ دقیق‌تر با فروشنده هماهنگ می‌کنم.',
  tone: 'خودمانی',
};

/** مدل تقلبی: بدون شبکه، فقط JSON آماده. */
function fakeAi(reply: string | null, enabled = true): AiService {
  return {
    enabled,
    model: 'fake-model',
    complete: async () => reply,
  } as unknown as AiService;
}

describe('باگ «کفش» و پیشنهاد نامربوط', () => {
  it('روسری برای «کفش» پیشنهاد نمی‌شود', () => {
    const titles = suggest('میخوام قیمت کفش هاتون رو بدونم', PRODUCTS).map(product => product.title);
    assert.deepEqual(titles, ['کفش لوفر چرم مشکی']);
  });

  it('سؤال درباره‌ی کفش، همان کفش را با قیمت واقعی نشان می‌دهد', () => {
    const reply = composeReply('میخوام قیمت کفش هاتون رو بدونم', SHOP, PRODUCTS);
    assert.match(reply.text, /کفش لوفر چرم مشکی/);
    assert.match(reply.text, /۱٬۸۵۰٬۰۰۰ تومان/);
    assert.doesNotMatch(reply.text, /روسری/);
    assert.doesNotMatch(reply.text, /محصولی با عنوان/);
  });

  it('واژه‌های گفتاری («هاتون»، «بدونم»، «رو») در نقل‌قول نمی‌آیند', () => {
    const reply = composeReply('قیمت کفش هاتون رو بدونم', SHOP, PRODUCTS);
    assert.doesNotMatch(reply.text, /بدونم/);
    assert.doesNotMatch(reply.text, /هاتون/);
  });

  it('محصول ناموجود واقعی: صریح می‌گوید نیست و محصول نامربوط پیشنهاد نمی‌دهد', () => {
    const reply = composeReply('قیمت شلوار جین چنده', SHOP, PRODUCTS);
    assert.equal(reply.reason, 'product_not_found');
    assert.match(reply.text, /در کاتالوگ فروشگاه نیست/);
    assert.doesNotMatch(reply.text, /روسری ابریشم/);
  });

  it('«کفش مردانه دارید؟» → نامزدها با دکمه، نه «مطمئن نشدم»', () => {
    const reply = composeReply('کفش مردانه دارید؟', SHOP, PRODUCTS);
    assert.match(reply.text, /کفش لوفر چرم مشکی/);
    assert.ok(reply.buttons?.length);
  });
});

describe('تشخیص نیت با مدل', () => {
  const rule = composeReply('کفش مجلسی زنانه دارید', SHOP, PRODUCTS);

  it('مدل محصول موجود را از میان عنوان‌های کاتالوگ انتخاب می‌کند', async () => {
    const result = await resolveReply({
      ai: fakeAi('{"intent":"product","match":"کفش لوفر چرم مشکی","keywords":"کفش","needsAnswer":false}'),
      shop: SHOP, products: PRODUCTS, text: 'کفش مجلسی زنانه دارید', rule,
    });
    assert.equal(result.source, 'ai_match');
    assert.match(result.text, /کفش لوفر چرم مشکی/);
    assert.match(result.text, /۱٬۸۵۰٬۰۰۰ تومان/);
  });

  it('عنوان ساختگی مدل پذیرفته نمی‌شود (مدل نمی‌تواند محصول بسازد)', async () => {
    const result = await resolveReply({
      ai: fakeAi('{"intent":"product","match":"کفش پاشنه بلند طلایی","keywords":"","needsAnswer":false}'),
      shop: SHOP, products: PRODUCTS, text: 'کفش مجلسی زنانه دارید', rule,
    });
    assert.equal(result.source, 'rules');
    assert.ok(result.ai?.skip === undefined || result.ai.skip === undefined);
  });

  it('اگر مدل هم محصولی پیدا نکند، پاسخ قاعده‌محور دست‌نخورده می‌ماند', async () => {
    const result = await resolveReply({
      ai: fakeAi('{"intent":"product","match":"","keywords":"","needsAnswer":false}'),
      shop: SHOP, products: PRODUCTS, text: 'کفش مجلسی زنانه دارید', rule,
    });
    assert.equal(result.source, 'rules');
    assert.equal(result.reason, rule.reason);
  });

  it('بدون مدل، هیچ فراخوانی و هیچ تغییری رخ نمی‌دهد', async () => {
    let called = false;
    const ai = { enabled: false, model: 'x', complete: async () => { called = true; return null; } } as unknown as AiService;
    const result = await resolveReply({ ai, shop: SHOP, products: PRODUCTS, text: 'کفش مجلسی زنانه دارید', rule });
    assert.equal(result.source, 'rules');
    assert.equal(called, false);
  });

  it('پاسخ روشن قاعده‌محور هرگز با مدل جایگزین نمی‌شود', async () => {
    const clear = composeReply('قیمت کفش چنده', SHOP, PRODUCTS);
    let called = false;
    const ai = { enabled: true, model: 'x', complete: async () => { called = true; return '{}'; } } as unknown as AiService;
    const result = await resolveReply({ ai, shop: SHOP, products: PRODUCTS, text: 'قیمت کفش چنده', rule: clear });
    assert.equal(called, false);
    assert.equal(result.text, clear.text);
  });
});
