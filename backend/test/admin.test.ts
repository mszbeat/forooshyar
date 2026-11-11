/**
 * تست‌های پنل ادمین: اعتبارسنجی تنظیمات، ماسک‌کردن رمزها و مرز دسترسی.
 *
 * بدون شبکه: فقط منطق `settings.catalog` و `settings.runtime`. لایه‌ی HTTP در
 * همین پروژه با تست‌های تلگرام پوشش داده شده است؛ اینجا هدف، قاعده‌هایی است که
 * اگر غلط باشند، یک کلید را می‌توان از پنل پاک کرد یا مقدار بی‌معنی ذخیره کرد.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AI_PROVIDERS, mask, safeDatabaseLabel, SETTINGS, SETTING_BY_KEY, validateValue } from '../src/admin/settings.catalog';
import { applyOverrides, normalizeValue } from '../src/admin/settings.runtime';

describe('فهرست تنظیمات پنل ادمین', () => {
  it('هر کلید یکتاست و گروه معتبر دارد', () => {
    const keys = SETTINGS.map(def => def.key);
    assert.equal(new Set(keys).size, keys.length);
    for (const def of SETTINGS) {
      assert.match(def.key, /^[A-Z][A-Z0-9_]*$/, def.key);
      assert.ok(['ai', 'telegram', 'payments', 'otp', 'database', 'system'].includes(def.group), def.key);
    }
  });

  it('هر میزبان مدل آدرس درگاه (یا حالت دستی) و حداقل یک مدل دارد', () => {
    for (const provider of AI_PROVIDERS) {
      // میزبان «دلخواه» آدرس ثابت ندارد؛ ادمین خودش وارد می‌کند.
      if (provider.custom) assert.equal(provider.baseUrl, '', provider.id);
      else assert.match(provider.baseUrl, /^https?:\/\//, provider.id);
      assert.ok(provider.models.length > 0, provider.id);
      for (const model of provider.models) assert.ok(model.value.length > 2, provider.id);
    }
  });

  it('فهرست میزبان‌ها همان سه گزینه‌ی پنل است و مدل رایگان علامت دارد', () => {
    assert.deepEqual(AI_PROVIDERS.map(provider => provider.id), ['openrouter', 'openai', 'custom']);
    const free = AI_PROVIDERS.flatMap(provider => provider.models).filter(model => model.free);
    assert.ok(free.length >= 3, `مدل رایگان: ${free.length}`);
    assert.ok(free.every(model => model.value.includes(':free')), 'علامت free باید با شناسه‌ی واقعی مدل بخواند');
  });

  it('مقادیر رمزآلود هرگز کامل برنمی‌گردند', () => {
    const secret = 'sk-live-abcdefghijklmnop';
    const masked = mask(secret);
    assert.notEqual(masked, secret);
    assert.ok(!masked.includes('abcdefghij'), masked);
    assert.ok(masked.endsWith('mnop'), masked);
    assert.equal(mask(''), '');
    assert.equal(mask('short'), '•••••');
  });

  it('آدرس دیتابیس بدون اعتبارنامه نمایش داده می‌شود', () => {
    const label = safeDatabaseLabel('postgresql://forooshyar:devpass@db.example.com:5432/shop?schema=public&sslmode=require');
    assert.ok(label);
    assert.equal(label!.host, 'db.example.com');
    assert.equal(label!.port, '5432');
    assert.equal(label!.database, 'shop');
    assert.ok(!label!.redacted.includes('devpass'), label!.redacted);
    assert.equal(safeDatabaseLabel('not-a-url'), null);
  });
});

describe('اعتبارسنجی مقادیر', () => {
  it('کلیدهای غیراختیاری خالی پذیرفته نمی‌شوند', () => {
    const model = SETTING_BY_KEY.get('AI_MODEL')!;
    assert.ok(validateValue(model, ''));
    assert.equal(validateValue(model, 'gpt-4o-mini'), null);
  });

  it('کلید اختیاری می‌تواند خالی بماند', () => {
    const key = SETTING_BY_KEY.get('AI_API_KEY')!;
    assert.equal(validateValue(key, ''), null);
  });

  it('عدد خارج از بازه رد می‌شود', () => {
    const temperature = SETTING_BY_KEY.get('AI_TEMPERATURE')!;
    assert.ok(validateValue(temperature, '5'));
    assert.ok(validateValue(temperature, 'abc'));
    assert.equal(validateValue(temperature, '0.3'), null);
  });

  it('آدرس باید http(s) باشد', () => {
    const base = SETTING_BY_KEY.get('AI_BASE_URL')!;
    assert.ok(validateValue(base, 'api.openai.com'));
    assert.ok(validateValue(base, 'ftp://x'));
    assert.equal(validateValue(base, 'https://api.openai.com/v1'), null);
  });

  it('سکرت webhook کوتاه رد می‌شود', () => {
    const secret = SETTING_BY_KEY.get('TELEGRAM_WEBHOOK_SECRET')!;
    assert.ok(validateValue(secret, 'short'));
    assert.equal(validateValue(secret, 'demo-webhook-secret-123456'), null);
  });

  it('DATABASE_URL فقط postgresql می‌پذیرد', () => {
    const url = SETTING_BY_KEY.get('DATABASE_URL')!;
    assert.ok(validateValue(url, 'mysql://x'));
    assert.equal(validateValue(url, 'postgresql://u:p@h:5432/d'), null);
  });

  it('پرچم‌ها به true/false نرمال می‌شوند', () => {
    assert.equal(normalizeValue('AI_ENABLED', 'on'), 'true');
    assert.equal(normalizeValue('AI_ENABLED', '0'), 'false');
    assert.equal(normalizeValue('AI_MODEL', ' gpt-4o-mini '), 'gpt-4o-mini');
  });
});

describe('اعمال تنظیمات روی محیط', () => {
  it('مقدار ذخیره‌شده env را می‌پوشاند و کلید ناشناخته نادیده می‌شود', () => {
    const env: NodeJS.ProcessEnv = { AI_MODEL: 'gpt-4o', JWT_SECRET: 'keep-me' };
    const result = applyOverrides([
      { key: 'AI_MODEL', value: 'gpt-4o-mini' },
      { key: 'JWT_SECRET', value: 'hacked' },
      { key: 'AI_ENABLED', value: '' },
    ], env);
    assert.equal(env.AI_MODEL, 'gpt-4o-mini');
    assert.equal(env.JWT_SECRET, 'keep-me');
    assert.deepEqual(result.applied, ['AI_MODEL']);
    assert.deepEqual(result.ignored, ['JWT_SECRET']);
  });

  it('مقدار خالی در دیتابیس، متغیر محیطی را پاک نمی‌کند', () => {
    const env: NodeJS.ProcessEnv = { TELEGRAM_BOT_TOKEN: '123:abc' };
    applyOverrides([{ key: 'TELEGRAM_BOT_TOKEN', value: '   ' }], env);
    assert.equal(env.TELEGRAM_BOT_TOKEN, '123:abc');
  });

  it('JWT_SECRET در فهرست تنظیمات نیست (نباید از پنل عوض شود)', () => {
    assert.equal(SETTING_BY_KEY.get('JWT_SECRET'), undefined);
  });
});
