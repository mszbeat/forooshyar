import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  BaleAdapter,
  RubikaAdapter,
  extractShopCode,
  verifyWebhookSecret,
} from '../src/channels/channel-adapters';

describe('Messenger webhook secret (Bale/Rubika shared bot)', () => {
  it('accepts the exact secret', () => {
    assert.equal(verifyWebhookSecret('s3cr3t-value-1234567890', 's3cr3t-value-1234567890'), true);
  });

  it('rejects a wrong secret of the same length', () => {
    assert.equal(verifyWebhookSecret('s3cr3t-value-1234567890', 's3cr3t-value-123456789X'), false);
  });

  it('rejects a different-length secret', () => {
    assert.equal(verifyWebhookSecret('short', 'much-longer-secret'), false);
  });

  it('rejects when no secret is configured (empty expected)', () => {
    assert.equal(verifyWebhookSecret('', ''), false);
    assert.equal(verifyWebhookSecret('', 'anything'), false);
  });
});

describe('Shop code extraction from /start deep link', () => {
  it('extracts the code from "/start <code>"', () => {
    assert.equal(extractShopCode('/start abc123'), 'abc123');
  });

  it('extracts the code without the leading slash', () => {
    assert.equal(extractShopCode('start shop-42_X'), 'shop-42_X');
  });

  it('returns empty for a plain message', () => {
    assert.equal(extractShopCode('سلام، قیمت این مدل چنده؟'), '');
  });

  it('returns empty for a bare /start without a code', () => {
    assert.equal(extractShopCode('/start'), '');
  });

  it('returns empty when extra text follows the code', () => {
    assert.equal(extractShopCode('/start abc123 سلام'), '');
  });
});

describe('Bale update normalization', () => {
  it('normalizes a Telegram-like update', () => {
    const message = BaleAdapter.normalize({
      update_id: 42,
      message: {
        message_id: 1,
        from: { id: 7, first_name: 'علی', username: 'ali' },
        chat: { id: 99 },
        text: '/start shopcode1',
      },
    });
    assert.ok(message);
    assert.equal(message.platform, 'BALE');
    assert.equal(message.chatId, '99');
    assert.equal(message.text, '/start shopcode1');
    assert.equal(message.senderName, 'علی');
    assert.equal(message.senderUsername, 'ali');
    assert.equal(message.updateId, '42');
  });

  it('returns null when there is no chat id', () => {
    assert.equal(BaleAdapter.normalize({ update_id: 1, message: {} }), null);
  });
});

describe('Rubika update normalization', () => {
  it('normalizes a Rubika update', () => {
    const message = RubikaAdapter.normalize({
      update_id: 'u1',
      message: {
        chat: { chat_id: 'c1' },
        sender: { first_name: 'سارا', username: 'sara' },
        text: 'سلام',
      },
    });
    assert.ok(message);
    assert.equal(message.platform, 'RUBIKA');
    assert.equal(message.chatId, 'c1');
    assert.equal(message.text, 'سلام');
    assert.equal(message.senderName, 'سارا');
  });

  it('returns null when there is no chat id', () => {
    assert.equal(RubikaAdapter.normalize({ message: {} }), null);
  });
});
