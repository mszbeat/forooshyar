import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { applyInput, promptFor, startDraft } from '../src/telegram/order-flow';

describe('multiline cart checkout', () => {
  it('saves the selected quantity before asking whether to add another product', () => {
    const draft = startDraft({ productId: 'p1', variantId: 'v1', title: 'Item', spec: '', price: 380, stock: 8 });
    const result = applyInput(draft, { data: 'flow:q:2' });
    assert.equal(result.kind, 'prompt');
    if (result.kind !== 'prompt') return;
    assert.equal(result.draft.quantity, 2);
    assert.equal(result.draft.step, 'name');
  });

  it('shows all cart lines, quantities, subtotal, shipping, and payable total', () => {
    const draft = {
      ...startDraft({ productId: 'p1', variantId: 'v1', title: 'Item A', spec: '', price: 380, stock: 8 }),
      step: 'confirm' as const,
      items: [
        { title: 'Item A', spec: '', price: 380, quantity: 1 },
        { title: 'Item B', spec: '', price: 120, quantity: 2 },
      ],
      shippingCost: 50,
      total: 670,
    };
    const invoice = promptFor(draft).text;
    assert.match(invoice, /Item A/);
    assert.match(invoice, /Item B/);
    assert.match(invoice, /جمع کالاها/);
    assert.match(invoice, /۶۲۰/);
    assert.match(invoice, /هزینه‌ی ارسال/);
    assert.match(invoice, /۶۷۰/);
  });
});
