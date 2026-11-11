import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SubscriptionsService } from '../src/subscriptions/subscriptions.service';

describe('trial و اشتراک فروشگاه', () => {
  it('trial شش‌روزه را تا زمان پایان فعال می‌شناسد', async () => {
    const db = { shop: { findUniqueOrThrow: async () => ({ trialStartedAt: new Date(), trialEndsAt: new Date(Date.now() + 60_000) }) }, subscription: { findFirst: async () => null }, subscriptionPlan: { findMany: async () => [] } };
    const service = new SubscriptionsService(db as never, { record: () => undefined } as never);
    const state = await service.status('shop-id');
    assert.equal(state.active, true); assert.equal(state.mode, 'trial');
  });
  it('بعد از پایان trial اتصال تازه را منع می‌کند و وضعیت را expired می‌دهد', async () => {
    const db = { shop: { findUniqueOrThrow: async () => ({ trialStartedAt: new Date(Date.now() - 8 * 86400000), trialEndsAt: new Date(Date.now() - 2 * 86400000) }) }, subscription: { findFirst: async () => null }, subscriptionPlan: { findMany: async () => [] } };
    const service = new SubscriptionsService(db as never, { record: () => undefined } as never);
    const state = await service.status('shop-id'); assert.equal(state.active, false); assert.equal(state.mode, 'expired');
    await assert.rejects(service.assertCanConnect('shop-id'), /دورهٔ آزمایشی تمام شده/u);
  });
  it('مدت بیشتر از ۱۸ ماه را پیش از هر درخواست به درگاه رد می‌کند', async () => {
    const service = new SubscriptionsService({} as never, {} as never);
    await assert.rejects(service.checkout('shop', 'plan', 19, 'https://api.example'), /بین ۱ تا ۱۸/u);
  });
});
