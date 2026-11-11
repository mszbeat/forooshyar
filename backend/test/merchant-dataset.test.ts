import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { composeReply, type BrainShop } from '../src/telegram/brain';
import type { CatalogProduct } from '../src/catalog/discovery';

type Case = { id: string; input: string; expected: string; mustContain?: string; mustNotContain?: string };
const cases = JSON.parse(readFileSync(new URL('./fixtures/merchant-reply-cases.json', import.meta.url), 'utf8')) as Case[];
const shop: BrainShop = { name: 'بوتیک باران', shipping: 'پست پیشتاز، ۲ تا ۴ روز کاری.', payment: 'پرداخت آنلاین یا کارت به کارت.', workingHours: 'هر روز ۹ تا ۲۳.', returns: 'تا ۷ روز مرجوعی.', handoffMessage: 'برای پاسخ دقیق‌تر با فروشنده هماهنگ می‌کنم.' };
const products: CatalogProduct[] = [
  { id: '11111111-1111-1111-1111-111111111111', title: 'روسری ابریشم مدل ستاره', variants: [{ id: 'v1', size: '', color: 'صورتی', price: 380000, stock: 4 }] },
  { id: '22222222-2222-2222-2222-222222222222', title: 'کفش لوفر چرم مشکی', variants: [{ id: 'v2', size: '41', color: 'مشکی', price: 1850000, stock: 2 }] },
  { id: '33333333-3333-3333-3333-333333333333', title: 'شال نخی تابستانی', variants: [{ id: 'v3', size: '', color: 'آبی', price: 420000, stock: 0 }] },
];

describe('دیتاست پاسخ فروشنده‌محور فارسی', () => {
  for (const item of cases) it(item.id, () => {
    const reply = composeReply(item.input, shop, products);
    assert.equal(reply.kind, item.expected, `kind mismatch: ${reply.text}`);
    if (item.mustContain) assert.ok(reply.text.includes(item.mustContain), `missing ${item.mustContain}: ${reply.text}`);
    if (item.mustNotContain) assert.ok(!reply.text.includes(item.mustNotContain), `unexpected ${item.mustNotContain}: ${reply.text}`);
    // قالب‌بندی تلگرام در این corpus است؛ Instagram باید formatter جداگانه‌اش را اعمال کند.
    assert.ok(reply.text.length <= 4096, 'Telegram message limit exceeded');
  });
});
