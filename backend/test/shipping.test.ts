import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { shippingCostFor, orderTotal, pickDefaultMethod } from '../src/orders/shipping';

const base = { id: 'm1', name: 'پست', baseCost: 45000, freeOver: null, rulesJson: {}, active: true };

test('FIXED مبلغ ثابت برمی‌گرداند', () => {
  assert.equal(shippingCostFor({ ...base, kind: 'FIXED' }, { subtotal: 100000, province: 'تهران', city: 'تهران' }), 45000);
});

test('FREE_OVER بالای آستانه رایگان است', () => {
  const method = { ...base, kind: 'FREE_OVER', freeOver: 2000000 };
  assert.equal(shippingCostFor(method, { subtotal: 2500000, province: 'تهران', city: 'تهران' }), 0);
  assert.equal(shippingCostFor(method, { subtotal: 1000000, province: 'تهران', city: 'تهران' }), 45000);
});

test('TABLE جدول استانی/شهری را رعایت می‌کند', () => {
  const method = {
    ...base, kind: 'TABLE',
    rulesJson: { 'تهران': 45000, 'تهران/شهریار': 60000, '*': 80000 },
  };
  assert.equal(shippingCostFor(method, { subtotal: 0, province: 'تهران', city: 'شهریار' }), 60000);
  assert.equal(shippingCostFor(method, { subtotal: 0, province: 'تهران', city: 'تهران' }), 45000);
  assert.equal(shippingCostFor(method, { subtotal: 0, province: 'فارس', city: 'شیراز' }), 80000);
});

test('PICKUP همیشه رایگان است', () => {
  assert.equal(shippingCostFor({ ...base, kind: 'PICKUP' }, { subtotal: 999, province: 'x', city: 'y' }), 0);
});

test('جمع نهایی هرگز منفی نمی‌شود', () => {
  assert.equal(orderTotal(100000, 45000, 20000), 125000);
  assert.equal(orderTotal(10000, 0, 50000), 0);
});

test('روش پیش‌فرض اولین روش فعال است', () => {
  const methods = [
    { ...base, id: 'a', active: false },
    { ...base, id: 'b', active: true },
  ];
  assert.equal(pickDefaultMethod(methods)?.id, 'b');
  assert.equal(pickDefaultMethod([{ ...base, active: false }]), null);
});
