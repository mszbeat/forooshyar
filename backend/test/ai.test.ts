import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AiService } from '../src/ai/ai.service';
import { answerWithAi } from '../src/ai/answer';
import { buildFacts, buildSystemPrompt, buildUserPrompt, guardAnswer, type AiShop } from '../src/ai/context';
import type { CatalogProduct } from '../src/catalog/discovery';

/**
 * تست لایه‌ی مدل زبانی بدون هیچ تماس شبکه‌ای: فقط ساخت «بسته‌ی زمینه» و
 * نگهبان خروجی. اگر روزی کسی اجازه دهد مدل قیمت از خودش بسازد، همین‌جا
 * می‌شکند.
 */

const SHOP: AiShop = {
  name: 'بوتیک باران',
  tone: 'خودمانی و کوتاه',
  shipping: 'پست پیشتاز، ۲ تا ۴ روز کاری.',
  payment: 'پرداخت آنلاین یا کارت به کارت.',
  workingHours: 'هر روز ۹ تا ۲۳.',
  returns: 'تا ۷ روز مرجوعی.',
  handoffMessage: 'خدمت فروشنده ارجاع می‌دهم.',
};

const PRODUCTS: CatalogProduct[] = [
  { id: 'aaaaaa11-1111-1111-1111-111111111111', title: 'مانتو کتان', variants: [
    { id: 'v1', size: '۳۸', color: 'کرم', price: 640_000, stock: 6 },
  ] },
  { id: 'bbbbbb22-2222-2222-2222-222222222222', title: 'کت پشمی', variants: [
    { id: 'v2', size: 'M', color: 'خاکستری', price: 1_890_000, stock: 0 },
  ] },
];

describe('بسته‌ی زمینه‌ی مدل زبانی', () => {
  it('قیمت و موجودی واقعی داخل واقعیت‌ها می‌آید', () => {
    const { facts, included, total } = buildFacts({ shop: SHOP, products: PRODUCTS });
    assert.equal(total, 2);
    assert.equal(included, 2);
    assert.match(facts, /مانتو کتان/);
    assert.match(facts, /۶۴۰٬۰۰۰ تومان/);
    assert.match(facts, /ناموجود/);
    assert.match(facts, /پست پیشتاز/);
  });

  it('محصولات موجود در بودجه‌ی محدود جلوتر می‌آیند', () => {
    // بودجه فقط برای یک خط کافی است.
    const { facts } = buildFacts({ shop: SHOP, products: PRODUCTS, catalogBudget: 90 });
    assert.match(facts, /مانتو کتان/);
    assert.doesNotMatch(facts, /کت پشمی/);
    assert.match(facts, /از ۲/);
  });

  it('پیام سیستم شامل نام فروشگاه و قواعد سخت است', () => {
    const system = buildSystemPrompt(SHOP);
    assert.match(system, /بوتیک باران/);
    assert.match(system, /فقط از «واقعیت‌های»/);
    assert.match(system, /خدمت فروشنده ارجاع می‌دهم/);
  });

  it('تاریخچه فقط چند پیام آخر را می‌آورد', () => {
    const history = Array.from({ length: 12 }, (_, index) => ({ direction: 'in' as const, text: `پیام ${index}` }));
    const prompt = buildUserPrompt('سلام', 'FACTS', history, 3);
    assert.match(prompt, /پیام 11/);
    assert.doesNotMatch(prompt, /پیام 8\n/);
  });
});

describe('نگهبان خروجی مدل', () => {
  const facts = 'مانتو کتان = ۶۴۰٬۰۰۰ تومان (۶ عدد)';

  it('قیمتی که در کاتالوگ هست قبول می‌شود', () => {
    assert.equal(guardAnswer('مانتو کتان ۶۴۰٬۰۰۰ تومان است و ۶ عدد موجود داریم.', facts).ok, true);
  });

  it('قیمت ساختگی رد می‌شود', () => {
    const result = guardAnswer('مانتو کتان ۵۹۰٬۰۰۰ تومان است.', facts);
    assert.equal(result.ok, false);
    assert.match(String(result.reason), /price_not_in_catalog/);
  });

  it('پاسخ خالی یا بی‌ربط رد می‌شود', () => {
    assert.equal(guardAnswer('   ', facts).ok, false);
    assert.equal(guardAnswer('باشه', facts).ok, false);
  });
});

describe('سرویس مدل زبانی', () => {
  it('بدون کلید، خاموش می‌ماند و بات قاعده‌محور ادامه می‌دهد', async () => {
    delete process.env.AI_ENABLED;
    delete process.env.AI_API_KEY;
    const ai = new AiService();
    assert.equal(ai.enabled, false);
    assert.equal(ai.status().reason, 'ai_disabled');
    const result = await answerWithAi(ai, { shop: SHOP, products: PRODUCTS }, 'سلام');
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, 'ai_disabled');
  });

  it('روشن ولی بدون کلید = آماده نیست (نه خطا)', () => {
    process.env.AI_ENABLED = 'true';
    delete process.env.AI_API_KEY;
    const ai = new AiService();
    assert.equal(ai.enabled, false);
    assert.equal(ai.status().reason, 'missing_api_key');
    delete process.env.AI_ENABLED;
  });
});
