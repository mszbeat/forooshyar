import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isDeliveryConfirmation } from '../src/telegram/delivery';

test('تأیید تحویل: جمله‌های صریح مشتری', () => {
  for (const text of [
    'تحویل داده شد ممنون',
    'تحویل گرفتم مرسی',
    'سفارش رسید دستم',
    'بسته به دستم رسید، ممنون',
    'دریافت کردم',
    'مرسوله رسید',
  ]) {
    assert.equal(isDeliveryConfirmation(text), true, text);
  }
});

test('تأیید تحویل: پرسش و نفی، تأیید نیست', () => {
  for (const text of [
    'کِی تحویل می‌دید؟',
    'سفارش هنوز نرسید',
    'تحویل نگرفتم',
    'بسته نیامده',
    'دریافت نکردم',
    'آیا ارسال با پست است؟',
    'قیمت این محصول چنده؟',
  ]) {
    assert.equal(isDeliveryConfirmation(text), false, text);
  }
});

test('تأیید تحویل: متن خیلی کوتاه یا خیلی بلند رد می‌شود', () => {
  assert.equal(isDeliveryConfirmation('رسید'), false);
  assert.equal(isDeliveryConfirmation('تحویل گرفتم '.repeat(30)), false);
});
