import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { guardPolish, POLISHABLE } from '../src/ai/polish';
import { TelegramService } from '../src/telegram/telegram.service';
import { actionsKeyboard, helpText, welcomeText, actionOf, BOT_COMMANDS } from '../src/telegram/menu';

/**
 * قفلِ باگ‌هایی که کاربر گزارش داد:
 * ۱) مشتری در تلگرام تگ `<b>` و `<code>` خام می‌دید.
 * ۲) بازنویسی لحن با مدل می‌توانست عدد یا کد کالا را عوض کند.
 * ۳) دکمه‌ی فایل در تلگرام هیچ فهرست عملیاتی نداشت.
 */

describe('قالب‌بندی تلگرام', () => {
  it('متن دارای تگ بدون parse_mode، خودکار HTML می‌شود', () => {
    assert.equal(TelegramService.parseModeOf('<b>قیمت</b> ۸۹۰٬۰۰۰ تومان'), 'HTML');
    assert.equal(TelegramService.parseModeOf('کد: <code>FDD21D</code>'), 'HTML');
    assert.equal(TelegramService.parseModeOf('سلام، در خدمتم.'), undefined);
    // مقدار صریح مقدم است.
    assert.equal(TelegramService.parseModeOf('بدون تگ', 'HTML'), 'HTML');
  });

  it('حذف تگ‌ها متن خوانا می‌سازد (مسیر جایگزین وقتی تلگرام قالب را رد کند)', () => {
    const clean = TelegramService.stripTags('🛍 <b>مانتو</b> — <code>MN-KTN</code>');
    assert.equal(clean, '🛍 مانتو — MN-KTN');
    assert.ok(!clean.includes('<'));
  });
});

describe('محافظ بازنویسی لحن', () => {
  const original = '🛍 <b>مانتو کتان تابستانه</b>\n🏷 کد محصول: <code>FDD21D</code>\n• سایز M — <b>۸۹۰٬۰۰۰ تومان</b> · ✅ ۱۲ عدد';

  it('بازنویسی سالم پذیرفته می‌شود', () => {
    const result = guardPolish(original, original);
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.text, original);
  });

  const rejects = (candidate: string) => {
    const result = guardPolish(original, candidate);
    assert.equal(result.ok, false, `باید رد می‌شد: ${candidate.slice(0, 40)}`);
  };

  it('رمان‌شدن یا کوتاه‌شدن افراطی رد می‌شود', () => {
    rejects('مانتو داریم.');
    rejects(`${original} ${original} ${original}`);
  });

  it('تغییر عدد یا کد کالا رد می‌شود', () => {
    rejects(original.replace('۸۹۰٬۰۰۰', '۹۹۰٬۰۰۰'));
    rejects(original.replace('FDD21D', 'FDD21E'));
  });

  it('حذف تگ‌ها رد می‌شود — قالب باید حفظ شود', () => {
    rejects(original.replace(/<\/?b>/g, ''));
  });

  it('مارک‌داون مدل‌ها رد می‌شود؛ تلگرام با HTML کار می‌کند نه **', () => {
    rejects(`**${original}**`);
  });

  it('پاسخ سفارش و ارجاع هرگز بازنویسی نمی‌شوند', () => {
    assert.ok(!POLISHABLE.has('order'));
    assert.ok(!POLISHABLE.has('handoff'));
    assert.ok(POLISHABLE.has('price'));
    assert.ok(POLISHABLE.has('stock'));
  });
});

describe('منوی بات', () => {
  it('دستورهای عمومی ثبت‌شده شامل محصولات و راهنماست', () => {
    const names = BOT_COMMANDS.map((command) => command.command);
    for (const name of ['start', 'products', 'orders', 'help']) assert.ok(names.includes(name), name);
  });

  it('کیبورد عملیات همیشه دیده می‌شود و دکمه‌های فرمانی نگاشت دارند', () => {
    const keyboard = actionsKeyboard() as unknown as {
      is_persistent?: boolean;
      keyboard: { text: string }[][];
    };
    assert.equal(keyboard.is_persistent, true);
    const labels = keyboard.keyboard.flat().map((button) => button.text);
    assert.ok(labels.length >= 6);
    // چهار دکمه باید مثل فرمان رفتار کنند؛ بقیه (ارسال، ساعت کاری، مرجوعی،
    // پرداخت) متن عادی‌اند و موتور قاعده‌محور خودش جوابشان را دارد.
    for (const label of ['محصولات', 'ثبت سفارش', 'راهنما', 'صحبت با فروشنده']) {
      const match = labels.find((text) => text.includes(label));
      assert.ok(match, `دکمه‌ی «${label}» نیست`);
      assert.ok(actionOf(match), `نگاشت برای «${match}» نیست`);
    }
  });

  it('متن خوش‌آمد و راهنما HTML معتبر تحویل می‌دهند', () => {
    const shop = { name: 'بوتیک نیلا', workingHours: 'شنبه تا پنجشنبه ۱۰ تا ۲۰', shipping: 'پست پیشتاز', payment: 'آنلاین', returns: 'تا ۷ روز' };
    const welcome = welcomeText({ name: shop.name, capabilities: ['قیمت و موجودی', 'ارسال'] });
    for (const text of [welcome, helpText(shop)]) {
      assert.ok(text.length > 40);
      assert.ok(text.includes('<b>'), 'تأکید باید با HTML باشد');
      assert.ok(!text.includes('**'), 'مارک‌داون نباید باشد');
      assert.equal(TelegramService.parseModeOf(text), 'HTML');
    }
  });
});
