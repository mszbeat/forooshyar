import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateCombinations, diffCombinations, combinationKey } from '../src/catalog/variant-combinations';
import { normalizePostInput } from '../src/catalog/post-link';
import { capabilitiesFor, parseNumberedChoice, normalizeDigits } from '../src/channels/capabilities';

describe('V4 Task 5: Cartesian product', () => {
  it('generates color x size combinations', () => {
    const combos = generateCombinations([
      { name: 'رنگ', values: ['مشکی', 'قهوه‌ای'] },
      { name: 'سایز', values: ['40', '41', '42'] },
    ]);
    assert.equal(combos.length, 6);
    assert.ok(combos.some(c => c.options['رنگ'] === 'مشکی' && c.options['سایز'] === '40'));
    assert.ok(combos.some(c => c.options['رنگ'] === 'قهوه‌ای' && c.options['سایز'] === '42'));
  });

  it('diff keeps edited variants and adds new ones', () => {
    const existing = [{ options: { 'رنگ': 'مشکی', 'سایز': '40' }, active: true }];
    const generated = generateCombinations([
      { name: 'رنگ', values: ['مشکی'] },
      { name: 'سایز', values: ['40', '41'] },
    ]);
    const diff = diffCombinations(existing, generated);
    assert.equal(diff.toKeep.length, 1);
    assert.equal(diff.toCreate.length, 1);
    assert.equal(diff.toDeactivate.length, 0);
  });

  it('combinationKey is stable regardless of key order', () => {
    assert.equal(combinationKey({ b: '2', a: '1' }), combinationKey({ a: '1', b: '2' }));
  });
});

describe('V4 Task 8: post link normalize', () => {
  it('extracts shortcode from post and reel URLs', () => {
    assert.equal(normalizePostInput('https://www.instagram.com/p/CdEfGh12345/').shortcode, 'CdEfGh12345');
    assert.equal(normalizePostInput('https://instagram.com/reel/AbC_123-xyz/').shortcode, 'AbC_123-xyz');
  });

  it('accepts bare shortcode and numeric media id', () => {
    assert.equal(normalizePostInput('CdEfGh12345').mediaId, 'CdEfGh12345');
    assert.equal(normalizePostInput('17891234567890123').mediaId, '17891234567890123');
  });

  it('rejects invalid input', () => {
    assert.throws(() => normalizePostInput('not a url at all!!!'));
  });
});

describe('V4 Task 12: channel capabilities + numbered list', () => {
  it('Telegram supports buttons, Instagram does not', () => {
    assert.equal(capabilitiesFor('TELEGRAM').supportsButtons, true);
    assert.equal(capabilitiesFor('INSTAGRAM').supportsButtons, false);
    assert.equal(capabilitiesFor('INSTAGRAM').supportsNumberedList, true);
  });

  it('parses Persian and English digits, tolerates extra text', () => {
    assert.equal(parseNumberedChoice('۱', 2), 1);
    assert.equal(parseNumberedChoice('2', 2), 2);
    assert.equal(parseNumberedChoice('گزینه ۲ را می‌خواهم', 2), 2);
    assert.equal(parseNumberedChoice('۳', 2), null);
    assert.equal(parseNumberedChoice('سلام', 2), null);
  });

  it('normalizes Persian digits', () => {
    assert.equal(normalizeDigits('۱۲۳'), '123');
  });
});
