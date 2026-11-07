import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { discover, looksLikeProductQuestion, matchCode, productCode } from '../src/catalog/discovery';
import { clarifyProducts, composeReply, describeProduct, orderButtons, productButtons } from '../src/telegram/brain';
import { applyInput, MAX_QUANTITY, normalizePhone, promptFor, startDraft } from '../src/telegram/order-flow';

/**
 * این تست‌ها به دیتابیس و تلگرام نیاز ندارند: منطق خالص تشخیص محصول و
 * حالت‌های سفارش است. اگر روزی قاعده‌ها عوض شوند، همین‌جا می‌شکند.
 */

const PRODUCTS = [
  { id: 'aaaaaa11-1111-1111-1111-111111111111', title: 'کت چرم مشکی', variants: [
    { id: 'v1', size: 'M', color: 'مشکی', price: 2_400_000, stock: 3 },
    { id: 'v2', size: 'L', color: 'مشکی', price: 2_400_000, stock: 0 },
  ] },
  { id: 'bbbbbb22-2222-2222-2222-222222222222', title: 'کت پشمی کرم', variants: [
    { id: 'v3', size: 'M', color: 'کرم', price: 1_800_000, stock: 5 },
  ] },
  { id: 'cccccc33-3333-3333-3333-333333333333', title: 'شال ابریشمی', variants: [
    { id: 'v4', size: '', color: 'زمردی', price: 1_250_000, stock: 2 },
  ] },
  { id: 'dddddd44-4444-4444-4444-444444444444', title: 'کیف چرم دستی', variants: [
    { id: 'v5', size: '', color: 'قهوه‌ای', price: 1_450_000, stock: 1 },
  ] },
];

const SHOP = {
  name: 'فروشگاه تست',
  shipping: 'ارسال با پست، ۲ تا ۴ روز کاری.',
  payment: 'پرداخت آنلاین یا کارت به کارت.',
  workingHours: 'هر روز ۹ تا ۱۸.',
  handoffMessage: 'برای پاسخ دقیق‌تر با فروشنده هماهنگ می‌کنم.',
};

describe('تشخیص محصول از حرف مشتری', () => {
  it('کد محصول دقیقاً همان محصول را می‌دهد', () => {
    const code = productCode(PRODUCTS[2].id);
    assert.equal(matchCode(`کد ${code}`, PRODUCTS)?.title, 'شال ابریشمی');
    assert.equal(matchCode(`#${code.toLowerCase()}`, PRODUCTS)?.title, 'شال ابریشمی');
  });

  it('«این کت چنده» دو کت را نامزد می‌کند، نه یکی را', () => {
    const result = discover('این کت چنده؟', PRODUCTS);
    assert.equal(result.kind, 'many');
    if (result.kind === 'many') {
      const titles = result.products.map(product => product.title);
      assert.deepEqual(titles.sort(), ['کت پشمی کرم', 'کت چرم مشکی']);
    }
  });

  it('«قیمت شال ابریشمی چنده» دقیقاً یک محصول است', () => {
    const result = discover('قیمت شال ابریشمی چنده', PRODUCTS);
    assert.equal(result.kind, 'single');
    if (result.kind === 'single') assert.equal(result.product.title, 'شال ابریشمی');
  });

  it('جمله‌ی ارسال و ساعت کاری محصول نامزد نمی‌کند', () => {
    assert.equal(discover('هزینه ارسال چنده؟', PRODUCTS).kind, 'none');
    assert.equal(discover('ساعت کاریتون؟', PRODUCTS).kind, 'none');
    assert.equal(discover('سلام', PRODUCTS).kind, 'none');
  });

  it('تشخیص «سؤال محصولی» درست کار می‌کند', () => {
    assert.equal(looksLikeProductQuestion('این کت چنده'), true);
    assert.equal(looksLikeProductQuestion('سلام خوبید'), false);
  });
});

describe('پاسخ بات', () => {
  it('ابهام → لیست محصولات با دکمه‌ی انتخاب و راهنمای کد', () => {
    const reply = clarifyProducts(PRODUCTS.slice(0, 2), 'این کت چنده');
    assert.equal(reply.kind, 'clarify');
    assert.match(reply.text, /کد:/);
    assert.match(reply.text, /نام دقیق/);
    const buttons = reply.buttons ?? [];
    assert.equal(buttons.length, 1, 'دو محصول → یک ردیف');
    assert.equal(buttons[0].length, 2);
    assert.ok(buttons[0][0].data?.startsWith('p:'));
  });

  it('یک محصول → قیمت همه‌ی سایزها و دکمه‌ی سفارش فقط برای موجودها', () => {
    const reply = describeProduct(PRODUCTS[0], 'قیمت کت چرم مشکی چنده');
    assert.match(reply.text, /سایز M/);
    assert.match(reply.text, /سایز L/);
    assert.match(reply.text, /ناموجود/);
    const rows = orderButtons(PRODUCTS[0]);
    assert.equal(rows.length, 1, 'فقط سایز M موجود است');
    assert.ok(rows[0][0].data?.startsWith('ord:'));
    assert.match(rows[0][0].text, /ثبت سفارش/);
  });

  it('سایز ناموجود → گزینه‌های واقعی نشان داده می‌شود، حدس زده نمی‌شود', () => {
    const reply = describeProduct(PRODUCTS[0], 'قیمت کت چرم مشکی سایز XL چنده');
    assert.equal(reply.kind, 'clarify');
    assert.match(reply.text, /XL/);
    assert.match(reply.text, /گزینه‌های ثبت‌شده/);
  });

  it('پرسش محصول + ارسال → درباره‌ی ارسال جواب می‌دهد', () => {
    const reply = composeReply('هزینه ارسال شال ابریشمی چنده؟', SHOP, PRODUCTS);
    assert.match(reply.text, /پست/);
  });

  it('کد محصول در جمله → همان محصول', () => {
    const reply = composeReply(`قیمت ${productCode(PRODUCTS[3].id)} چنده`, SHOP, PRODUCTS);
    assert.match(reply.text, /کیف چرم دستی/);
  });

  it('سؤال بی‌ربط → ارجاع به فروشنده (بدون حدس)', () => {
    const reply = composeReply('پولمو پس بدید', SHOP, PRODUCTS);
    assert.equal(reply.kind, 'handoff');
  });
});

describe('سفارش گام‌به‌گام', () => {
  const draft = startDraft({ productId: PRODUCTS[3].id, variantId: 'v5', title: 'کیف چرم دستی', spec: 'رنگ قهوه‌ای', price: 1_450_000, stock: 1 });

  it('شماره‌ی موبایل با فرمت‌های مختلف یکی می‌شود', () => {
    assert.equal(normalizePhone('۰۹۱۲۳۴۵۶۷۸۹'), '09123456789');
    assert.equal(normalizePhone('+98 912 345 6789'), '09123456789');
    assert.equal(normalizePhone('00989123456789'), '09123456789');
    assert.equal(normalizePhone('9123456789'), '09123456789');
    assert.equal(normalizePhone('12345'), null);
  });

  it('مسیر کامل: تعداد → نام → موبایل → نشانی → تأیید', () => {
    let current = draft;
    let outcome = applyInput(current, { text: '2' });
    assert.equal(outcome.kind, 'invalid', 'موجودی ۱ عدد است، ۲ عدد نباید قبول شود');
    outcome = applyInput(current, { text: '1' });
    assert.equal(outcome.kind, 'prompt');
    if (outcome.kind !== 'prompt') return;
    assert.equal(outcome.draft.step, 'name');

    current = outcome.draft;
    outcome = applyInput(current, { text: 'علی رضایی' });
    if (outcome.kind !== 'prompt') return assert.fail('باید به مرحله‌ی موبایل برود');
    current = outcome.draft;
    assert.equal(current.step, 'phone');

    outcome = applyInput(current, { text: '۰۹۱۲۳۴۵۶۷۸۹' });
    if (outcome.kind !== 'prompt') return assert.fail('موبایل معتبر باید قبول شود');
    current = outcome.draft;
    assert.equal(current.step, 'address');

    outcome = applyInput(current, { text: 'تهران، خیابان ولیعصر، پلاک ۱۰، کد پستی ۱۲۳۴۵۶۷۸۹۰' });
    if (outcome.kind !== 'prompt') return assert.fail('نشانی باید قبول شود');
    current = outcome.draft;
    assert.equal(current.step, 'confirm');
    assert.match(promptFor(current).text, /پیش‌فاکتور/);

    const ready = applyInput(current, { data: 'flow:confirm' });
    assert.equal(ready.kind, 'ready');
    if (ready.kind === 'ready') {
      assert.equal(ready.draft.quantity, 1);
      assert.equal(ready.draft.phone, '09123456789');
    }
  });

  it('ورودی نامعتبر از جریان بیرون نمی‌اندازد', () => {
    const phoneStep = { ...draft, step: 'phone' as const, quantity: 1, name: 'علی' };
    const outcome = applyInput(phoneStep, { text: 'سلام' });
    assert.equal(outcome.kind, 'invalid');
    if (outcome.kind === 'invalid') assert.equal(outcome.draft.step, 'phone');
  });

  it('لغو در هر مرحله', () => {
    assert.equal(applyInput({ ...draft, step: 'confirm', quantity: 1 }, { data: 'flow:cancel' }).kind, 'cancel');
    assert.equal(applyInput({ ...draft, step: 'address', quantity: 1 }, { text: 'لغو' }).kind, 'cancel');
  });

  it('دکمه‌های تعداد بیش از موجودی نمایش داده نمی‌شوند', () => {
    const prompt = promptFor(draft);
    const buttons = (prompt.buttons ?? []).flat().map(button => button.data);
    assert.ok(buttons.includes('flow:q:1'));
    assert.ok(!buttons.includes('flow:q:2'), 'موجودی ۱ است');
    assert.equal(MAX_QUANTITY, 10);
  });

  it('نام از تلگرام با دکمه', () => {
    const step = { ...draft, step: 'name' as const, quantity: 1 };
    const outcome = applyInput(step, { data: 'flow:name:self', telegramName: 'سارا' });
    assert.equal(outcome.kind, 'prompt');
    if (outcome.kind === 'prompt') {
      assert.equal(outcome.draft.name, 'سارا');
      assert.equal(outcome.draft.step, 'phone');
    }
  });
});
