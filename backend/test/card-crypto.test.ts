import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  encryptCard,
  decryptCard,
  isValidCardNumber,
  maskCard,
} from '../src/payments/card-crypto';

test('رمزنگاری و رمزگشایی شماره کارت برگشت‌پذیر است', () => {
  const card = '6037991234567893';
  const encrypted = encryptCard(card);
  assert.notEqual(encrypted, card);
  assert.equal(decryptCard(encrypted), card);
});

test('هر رمزنگاری IV تازه دارد', () => {
  const card = '6037991234567893';
  assert.notEqual(encryptCard(card), encryptCard(card));
});

test('Luhn شماره کارت معتبر را می‌پذیرد و نامعتبر را رد می‌کند', () => {
  // 6037991234567893 رقم کنترل Luhn را دارد.
  assert.equal(isValidCardNumber('6037991234567893'), true);
  assert.equal(isValidCardNumber('6037 9912 3456 7893'), true);
  assert.equal(isValidCardNumber('6037991234567890'), false);
  assert.equal(isValidCardNumber('1234567890123456'), false);
  assert.equal(isValidCardNumber('603799123456789'), false);
});

test('ماسک فقط چهار رقم آخر را نشان می‌دهد', () => {
  assert.equal(maskCard('6037991234567893'), '**** **** **** 7893');
});
