import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { verifyReceipt, normalizeDigits } from '../src/orders/receipt-verify';

const input = {
  expectedTotal: 145000,
  destinationLast4s: ['7893'],
  destinationHolders: ['علی رضایی'],
  usedTrackingCodes: ['999888'],
  orderCreatedAt: new Date('2026-11-12T10:00:00Z'),
  now: new Date('2026-11-12T11:00:00Z'),
};

const good = {
  readable: true,
  amount: 145000,
  amountCurrency: 'toman' as const,
  destinationCardLast4: '6037991234567893',
  trackingCode: '123456',
  dateTime: '2026-11-12T10:30:00Z',
};

test('رسید کامل و درست CONFIRMED می‌شود', () => {
  const result = verifyReceipt(good, input);
  assert.equal(result.verdict, 'CONFIRMED');
  assert.ok(result.checks.every((c) => c.ok));
});

test('مبلغ ریالی هم پشتیبانی می‌شود (ریال = تومان × ۱۰)', () => {
  const result = verifyReceipt({ ...good, amount: 1450000, amountCurrency: 'rial' }, input);
  assert.equal(result.verdict, 'CONFIRMED');
});

test('مبلغ اشتباه REJECTED می‌شود', () => {
  const result = verifyReceipt({ ...good, amount: 100000 }, input);
  assert.equal(result.verdict, 'REJECTED');
});

test('کارت مقصد اشتباه REJECTED می‌شود', () => {
  const result = verifyReceipt({ ...good, destinationCardLast4: '6037991234560000' }, input);
  assert.equal(result.verdict, 'REJECTED');
});

test('شماره پیگیری تکراری NEEDS_REVIEW می‌شود', () => {
  const result = verifyReceipt({ ...good, trackingCode: '999888' }, input);
  assert.equal(result.verdict, 'NEEDS_REVIEW');
});

test('رسید خارج از پنجره‌ی زمانی NEEDS_REVIEW می‌شود', () => {
  const result = verifyReceipt({ ...good, dateTime: '2026-11-01T10:00:00Z' }, input);
  assert.equal(result.verdict, 'NEEDS_REVIEW');
});

test('رسید ناخوانا NEEDS_REVIEW می‌شود', () => {
  const result = verifyReceipt({ readable: false }, input);
  assert.equal(result.verdict, 'NEEDS_REVIEW');
});

test('اعداد فارسی نرمال می‌شوند', () => {
  assert.equal(normalizeDigits('۱۲۳٬۴۵۶'), '123456');
  const result = verifyReceipt({ ...good, amount: Number('۱۴۵۰۰۰'.replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 1776))) }, input);
  assert.equal(result.verdict, 'CONFIRMED');
});
