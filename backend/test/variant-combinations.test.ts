import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  generateCombinations,
  diffCombinations,
  combinationKey,
  cleanBatchInput,
  MAX_VARIANT_COMBINATIONS,
} from '../src/catalog/variant-combinations';

test('ضرب دکارتی دو ویژگی را درست می‌سازد', () => {
  const combos = generateCombinations([
    { name: 'رنگ', values: ['مشکی', 'سفید'] },
    { name: 'سایز', values: ['S', 'M'] },
  ]);
  assert.equal(combos.length, 4);
  assert.deepEqual(
    combos.map((c) => c.key).sort(),
    ['رنگ=سفید|سایز=M', 'رنگ=سفید|سایز=S', 'رنگ=مشکی|سایز=M', 'رنگ=مشکی|سایز=S'],
  );
});

test('بدون ویژگی، یک ترکیب خالی برمی‌گرداند', () => {
  assert.deepEqual(generateCombinations([]), [{ options: {}, key: '' }]);
  assert.deepEqual(generateCombinations([{ name: 'رنگ', values: [] }]), [
    { options: {}, key: '' },
  ]);
});

test('از سقف ۲۰۰ ترکیب رد نمی‌شود', () => {
  assert.throws(
    () =>
      generateCombinations([
        { name: 'الف', values: Array.from({ length: 15 }, (_, i) => `v${i}`) },
        { name: 'ب', values: Array.from({ length: 15 }, (_, i) => `w${i}`) },
      ]),
    new RegExp(String(MAX_VARIANT_COMBINATIONS)),
  );
});

test('کلید ترکیب مستقل از ترتیب ویژگی‌هاست', () => {
  assert.equal(
    combinationKey({ ب: '1', الف: '2' }),
    combinationKey({ الف: '2', ب: '1' }),
  );
});

test('ترکیب‌های موجود را نگه می‌دارد و فقط جدیدها را می‌سازد', () => {
  const existing = [
    { options: { رنگ: 'مشکی' }, active: true },
    { options: { رنگ: 'سفید' }, active: true },
  ];
  const generated = generateCombinations([
    { name: 'رنگ', values: ['مشکی', 'قرمز'] },
  ]);
  const diff = diffCombinations(existing, generated);
  assert.deepEqual(diff.toKeep.map((c) => c.key), ['رنگ=مشکی']);
  assert.deepEqual(diff.toCreate.map((c) => c.key), ['رنگ=قرمز']);
  assert.deepEqual(diff.toDeactivate.map((c) => c.key), ['رنگ=سفید']);
});

test('واریانت غیرفعالِ حذف‌شده دوباره غیرفعال نمی‌شود', () => {
  const diff = diffCombinations(
    [{ options: { رنگ: 'سفید' }, active: false }],
    generateCombinations([{ name: 'رنگ', values: ['مشکی'] }]),
  );
  assert.equal(diff.toDeactivate.length, 0);
});

// ------------------------------------------------- ثبت دسته‌ای (پیش‌نویس مودال)

test('cleanBatchInput ترکیب‌های مرتب رنگ×سایز را با کلید پایدار می‌سازد', () => {
  const cleaned = cleanBatchInput({
    attributes: [
      { name: 'رنگ', values: ['مشکی', 'آبی'] },
      { name: 'سایز', values: ['M', 'L'] },
    ],
    variants: [
      { options: { رنگ: 'مشکی', سایز: 'M' }, price: 100, stock: 5 },
      { options: { رنگ: 'مشکی', سایز: 'L' }, price: 100, stock: 5 },
      { options: { رنگ: 'آبی', سایز: 'M' }, price: 120, stock: 3 },
      { options: { رنگ: 'آبی', سایز: 'L' }, price: 120, stock: 3 },
    ],
  });
  assert.equal(cleaned.variants.length, 4);
  assert.equal(cleaned.variants[0].key, 'رنگ=مشکی|سایز=M');
  assert.equal(cleaned.variants[3].price, 120);
});

test('cleanBatchInput ویژگی ناشناخته در گزینه‌ها را رد می‌کند', () => {
  assert.throws(() => cleanBatchInput({
    attributes: [{ name: 'رنگ', values: ['مشکی'] }],
    variants: [{ options: { جنس: 'نخی' }, price: 10, stock: 1 }],
  }), /در فهرست ویژگی‌ها نیست/);
});

test('cleanBatchInput ترکیب تکراری را رد می‌کند', () => {
  assert.throws(() => cleanBatchInput({
    attributes: [{ name: 'رنگ', values: ['مشکی'] }],
    variants: [
      { options: { رنگ: 'مشکی' }, price: 10, stock: 1 },
      { options: { رنگ: 'مشکی' }, price: 20, stock: 2 },
    ],
  }), /ترکیب تکراری/);
});

test('cleanBatchInput قیمت و موجودی منفی را رد می‌کند', () => {
  assert.throws(() => cleanBatchInput({
    attributes: [{ name: 'رنگ', values: ['مشکی'] }],
    variants: [{ options: { رنگ: 'مشکی' }, price: -1, stock: 1 }],
  }), /قیمت/);
  assert.throws(() => cleanBatchInput({
    attributes: [{ name: 'رنگ', values: ['مشکی'] }],
    variants: [{ options: { رنگ: 'مشکی' }, price: 10, stock: -2 }],
  }), /موجودی/);
});

test('cleanBatchInput نام ویژگی تکراری را رد می‌کند', () => {
  assert.throws(() => cleanBatchInput({
    attributes: [
      { name: 'رنگ', values: ['مشکی'] },
      { name: 'رنگ', values: ['آبی'] },
    ],
    variants: [{ options: { رنگ: 'مشکی' }, price: 10, stock: 1 }],
  }), /تکراری/);
});
