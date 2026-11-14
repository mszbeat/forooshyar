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
  it('normalizes the official Rubika webhook shape and extracts deep-link start_id', () => {
    const message = RubikaAdapter.normalize({
      update_id: 'u1',
      update: {
        type: 'NewMessage',
        chat_id: 'c1',
        new_message: {
          sender_id: 'user-1',
          text: '',
          aux_data: { start_id: 'shop-42_X' },
        },
      },
    });
    assert.ok(message);
    assert.equal(message.platform, 'RUBIKA');
    assert.equal(message.chatId, 'c1');
    assert.equal(message.text, '/start shop-42_X');
    assert.equal(message.startCode, 'shop-42_X');
    assert.equal(message.senderUsername, '');
    assert.equal(message.updateId, 'u1');
  });

  it('normalizes a regular Rubika message from the official update envelope', () => {
    const message = RubikaAdapter.normalize({
      update_id: 'u2',
      update: {
        type: 'NewMessage',
        chat_id: 'c2',
        new_message: { sender_id: 'user-2', text: 'سلام' },
      },
    });
    assert.ok(message);
    assert.equal(message.chatId, 'c2');
    assert.equal(message.text, 'سلام');
  });

  it('sends Rubika messages through the v3 token-scoped API endpoint', async () => {
    const originalFetch = globalThis.fetch;
    let requestedUrl = '';
    let requestBody = '';
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      requestedUrl = String(input);
      requestBody = String(init?.body ?? '');
      return new Response(JSON.stringify({ status: 'OK' }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;
    try {
      const result = await new RubikaAdapter('token-123').send({ chatId: 'chat-1', text: 'سلام' });
      assert.deepEqual(result, { ok: true });
      assert.equal(requestedUrl, 'https://botapi.rubika.ir/v3/token-123/sendMessage');
      assert.deepEqual(JSON.parse(requestBody), { chat_id: 'chat-1', text: 'سلام' });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('returns null when there is no chat id', () => {
    assert.equal(RubikaAdapter.normalize({ message: {} }), null);
  });
});
