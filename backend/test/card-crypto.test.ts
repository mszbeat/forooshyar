import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

// کلید تست ۳۲ بایتی base64
process.env.CARD_ENCRYPTION_KEY = randomBytes(32).toString('base64');
process.env.JWT_SECRET = 'test-secret-for-card-crypto-tests-only';

import { decryptCard, encryptCard, hashCard, isValidCardNumber } from '../src/payments/card-crypto';

describe('card crypto', () => {
  it('round-trip: encrypt then decrypt returns the original', () => {
    const card = '6037991234567893';
    const encrypted = encryptCard(card);
    assert.ok(encrypted.startsWith('v1.'), 'should have version prefix');
    assert.equal(decryptCard(encrypted), card);
  });

  it('two encryptions of the same card differ (random IV)', () => {
    const card = '6037991234567893';
    assert.notEqual(encryptCard(card), encryptCard(card));
  });

  it('wrong key fails to decrypt', () => {
    const card = '6037991234567893';
    const encrypted = encryptCard(card);
    process.env.CARD_ENCRYPTION_KEY = randomBytes(32).toString('base64');
    assert.throws(() => decryptCard(encrypted));
  });

  it('hashCard is deterministic and different for different cards', () => {
    assert.equal(hashCard('6037991234567893'), hashCard('6037991234567893'));
    assert.notEqual(hashCard('6037991234567893'), hashCard('6037991234567890'));
  });

  it('isValidCardNumber accepts Luhn-valid and rejects invalid', () => {
    assert.equal(isValidCardNumber('6037991234567893'), true);
    assert.equal(isValidCardNumber('6037 9912 3456 7893'), true);
    assert.equal(isValidCardNumber('6037991234567890'), false);
    assert.equal(isValidCardNumber('1234'), false);
  });
});
