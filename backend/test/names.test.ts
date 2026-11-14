import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { displayName, pseudonymNumber } from '../src/chat/chat.service';

/**
 * نام نمایشی مشتری: نام واقعی ← نام کاربری ← نام مستعار پایدار.
 * مستعار باید برای یک گفتگو همیشه یکی باشد و برای دو گفتگو متفاوت، متفاوت.
 */
describe('نام نمایشی مشتری', () => {
  it('نام واقعی مقدم است', () => {
    assert.equal(displayName({ chatId: 'ig:123', firstName: 'سارا محمدی', username: 'sara' }), 'سارا محمدی');
  });

  it('بدون نام واقعی، نام کاربری با @ نمایش داده می‌شود', () => {
    assert.equal(displayName({ chatId: 'ig:123', firstName: '', username: 'sara.m' }), '@sara.m');
    assert.equal(displayName({ chatId: '456', firstName: '', username: '@ali' }), '@ali');
  });

  it('شناسه‌ی فنی روبیکا و بله را به‌جای username نشان نمی‌دهد', () => {
    const uuid = '2Kn0d009ae6122b5f6e7cd4fc537';
    assert.match(displayName({ chatId: `rubika:${uuid}`, firstName: '', username: uuid }), /^مشتری روبیکا /u);
    assert.match(displayName({ chatId: 'bale:123456789012345678901234', firstName: '', username: '123456789012345678901234' }), /^مشتری بله /u);
    assert.equal(displayName({ chatId: 'rubika:c1', firstName: '', username: 'real_user' }), '@real_user');
  });

  it('بدون هیچ نام، مستعار پایدار و کانال‌دار برمی‌گردد', () => {
    const ig = displayName({ chatId: 'ig:123456', firstName: '', username: '' });
    const tg = displayName({ chatId: '987654', firstName: '', username: '' });
    assert.match(ig, /^مشتری اینستاگرام [۰-۹٬]{4,5}$/u);
    assert.match(tg, /^مشتری تلگرام [۰-۹٬]{4,5}$/u);
  });

  it('مستعار یک گفتگو همیشه یکی است و بین گفتگوها فرق می‌کند', () => {
    const a = displayName({ chatId: 'ig:111', firstName: '', username: '' });
    const b = displayName({ chatId: 'ig:111', firstName: '', username: '' });
    const c = displayName({ chatId: 'ig:222', firstName: '', username: '' });
    assert.equal(a, b);
    assert.notEqual(a, c);
    assert.equal(pseudonymNumber('ig:111'), pseudonymNumber('ig:111'));
  });
});
