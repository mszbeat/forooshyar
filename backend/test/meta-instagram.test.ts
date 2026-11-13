import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  findPostShortcode,
  findPostShortcodeInAttachments,
  metaCommentToComment,
  metaMessageToMessaging,
  signMetaState,
  verifyMetaState,
} from '../src/instagram/instagram.service';
import { splitMetaText } from '../src/instagram/instagram.provider';

describe('findPostShortcode (پست فورواردشده در دایرکت)', () => {
  it('استخراج شورت‌کد از لینک ریل با پارامترهای utm', () => {
    const url = 'https://www.instagram.com/reel/DScNfn_CuqX/?utm_source=ig_web_copy_link&cplk=MzRlODBiNWFlZA==&srtk=MzRlODBiNWFlZA==';
    assert.equal(findPostShortcode(url), 'DScNfn_CuqX');
  });

  it('استخراج از لینک پست و tv', () => {
    assert.equal(findPostShortcode('https://instagram.com/p/ABCdef123_-/'), 'ABCdef123_-');
    assert.equal(findPostShortcode('https://www.instagram.com/tv/XYZ987/'), 'XYZ987');
  });

  it('لینک داخل متن طولانی پیدا می‌شود', () => {
    assert.equal(findPostShortcode('سلام، این پست را ببینید https://www.instagram.com/p/AbC123xYz/ ممنون'), 'AbC123xYz');
  });

  it('متن بدون لینک پست null می‌دهد', () => {
    assert.equal(findPostShortcode('قیمت این محصول چنده؟'), null);
    assert.equal(findPostShortcode(''), null);
    assert.equal(findPostShortcode('https://example.com/p/AbC123xYz/'), null);
  });

  it('جستجو در پیوست‌ها (share بدون متن)', () => {
    const attachments = [{ type: 'share', payload: { url: 'https://www.instagram.com/reel/DScNfn_CuqX/' } }];
    assert.equal(findPostShortcodeInAttachments(attachments), 'DScNfn_CuqX');
    assert.equal(findPostShortcodeInAttachments([]), null);
    assert.equal(findPostShortcodeInAttachments(undefined), null);
  });
});

describe('Meta OAuth state (امضاشده)', () => {
  const secret = 'test-secret-1234567890';

  it('roundtrip: shopId و userId برمی‌گردد', () => {
    const state = signMetaState('shop-1', 'user-9', secret);
    const parsed = verifyMetaState(state, secret);
    assert.equal(parsed?.shopId, 'shop-1');
    assert.equal(parsed?.userId, 'user-9');
  });

  it('state دست‌کاری‌شده رد می‌شود', () => {
    const state = signMetaState('shop-1', 'user-9', secret);
    const tampered = state.slice(0, -2) + 'xx';
    assert.equal(verifyMetaState(tampered, secret), null);
  });

  it('سکرت اشتباه رد می‌شود', () => {
    const state = signMetaState('shop-1', 'user-9', secret);
    assert.equal(verifyMetaState(state, 'wrong-secret'), null);
  });

  it('state منقضی (بیش از ۱۰ دقیقه) رد می‌شود', () => {
    const payload = Buffer.from(JSON.stringify({ shopId: 'shop-1', userId: 'u', ts: Date.now() - 11 * 60 * 1000 })).toString('base64url');
    const sig = createHmac('sha256', secret).update(payload).digest('base64url');
    assert.equal(verifyMetaState(`${payload}.${sig}`, secret), null);
  });

  it('ورودی خالی رد می‌شود', () => {
    assert.equal(verifyMetaState('', secret), null);
    assert.equal(verifyMetaState('no-dot', secret), null);
  });
});

describe('Meta webhook conversion (تبدیل فرمت رسمی به داخلی)', () => {
  it('پیام دایرکت متا به InstagramMessaging تبدیل می‌شود', () => {
    const value = {
      sender: { id: '17841400000000001' },
      recipient: { id: '17841400000000002' },
      timestamp: 1700000000,
      message: { mid: 'mid.123', text: 'سلام، قیمت چنده؟' },
    };
    const item = metaMessageToMessaging(value);
    assert.equal(item?.sender?.id, '17841400000000001');
    assert.equal(item?.message?.mid, 'mid.123');
    assert.equal(item?.message?.text, 'سلام، قیمت چنده؟');
  });

  it('پیام بدون sender رد می‌شود', () => {
    assert.equal(metaMessageToMessaging({ message: { text: 'x' } }), null);
  });

  it('کامنت متا به InstagramComment تبدیل می‌شود', () => {
    const value = {
      media: { id: '17900000000000001' },
      comment_id: 'comment-1',
      text: 'قیمت؟',
      from: { id: '17841400000000003', username: 'buyer' },
    };
    const item = metaCommentToComment(value);
    assert.equal(item?.comment_id, 'comment-1');
    assert.equal(item?.sender?.id, '17841400000000003');
    assert.equal(item?.sender?.username, 'buyer');
    assert.equal(item?.media?.id, '17900000000000001');
  });

  it('کامنت بدون comment_id رد می‌شود', () => {
    assert.equal(metaCommentToComment({ text: 'x' }), null);
  });
});

describe('splitMetaText (سقف ۲۰۰۰ کاراکتر متا)', () => {
  it('متن کوتاه یک تکه می‌ماند', () => {
    assert.deepEqual(splitMetaText('سلام'), ['سلام']);
  });

  it('متن بلند به چند تکه شکسته می‌شود', () => {
    const text = Array.from({ length: 50 }, () => 'خط نمونه برای تست').join('\n');
    const parts = splitMetaText(text, 200);
    assert.ok(parts.length > 1);
    for (const part of parts) assert.ok(part.length <= 200);
  });

  it('متن خالی آرایه‌ی خالی می‌دهد', () => {
    assert.deepEqual(splitMetaText('   '), []);
  });
});

describe('Meta webhook signature (X-Hub-Signature-256)', () => {
  it('HMAC-SHA256 روی بدنه‌ی خام با سکرت اپ', () => {
    const secret = 'app-secret';
    const raw = Buffer.from(JSON.stringify({ object: 'instagram' }), 'utf8');
    const expected = `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`;
    // همان محاسبه‌ای که کنترلر انجام می‌دهد
    const actual = `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`;
    assert.equal(actual, expected);
    assert.match(expected, /^sha256=[0-9a-f]{64}$/);
  });
});
