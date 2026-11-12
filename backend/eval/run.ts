/**
 * مجموعه‌ی ارزیابی پاسخ‌گویی (بدون نیاز به دیتابیس یا مدل زبانی).
 *
 * چه چیزی را می‌سنجد:
 *  ۱) موتور قاعده‌محور (`composeReply`) روی ۵۰ سؤال فارسی واقعی: نوع پاسخ،
 *     دلیل انتخاب، و اینکه قیمت/موجودیِ درست در متن باشد (و عدد اشتباه نباشد).
 *  ۲) لایه‌ی ماسک (`maskFacts`/`restoreFacts`): رفت‌وبرگشت دقیق، ردِ
 *     جای‌نگه‌دارِ جابه‌جا/حذف‌شده/ساخته‌شده.
 *  ۳) نگهبان بازنویسی (`guardPolish`): تغییر قیمت یا کد باید رد شود.
 *
 * اجرا: `npm run eval`
 * خروجی: گزارش هر سؤال + خلاصه؛ کد خروج غیرصفر اگر چیزی خراب باشد.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { composeReply, type BrainShop } from '../src/telegram/brain';
import type { CatalogProduct } from '../src/catalog/discovery';
import { maskFacts, restoreFacts } from '../src/ai/mask';
import { guardPolish } from '../src/ai/polish';

type Question = {
  q: string;
  kind: string;
  reason?: string;
  mustContain?: string[];
  mustNotContain?: string[];
};

type Dataset = {
  shop: BrainShop;
  products: CatalogProduct[];
  questions: Question[];
};

const dataset = JSON.parse(readFileSync(join(__dirname, 'questions.json'), 'utf8')) as Dataset;

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(label: string, ok: boolean, detail = '') {
  if (ok) {
    passed += 1;
  } else {
    failed += 1;
    failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function reasonMatches(expected: string | undefined, actual: string | undefined): boolean {
  if (!expected) return true;
  if (expected.startsWith('~')) return (actual ?? '').startsWith(expected.slice(1));
  return actual === expected;
}

/* ------------------------------------------------------- ۱) موتور قاعده‌محور */

console.log(`\nارزیابی موتور قاعده‌محور — ${dataset.questions.length} سؤال\n`);

for (const item of dataset.questions) {
  const reply = composeReply(item.q, dataset.shop, dataset.products);
  const problems: string[] = [];

  if (reply.kind !== item.kind) problems.push(`kind: انتظار ${item.kind}، شد ${reply.kind}`);
  if (!reasonMatches(item.reason, reply.reason)) problems.push(`reason: انتظار ${item.reason ?? '—'}، شد ${reply.reason ?? '—'}`);
  for (const needle of item.mustContain ?? []) {
    if (!reply.text.includes(needle)) problems.push(`متن باید «${needle}» را داشته باشد`);
  }
  for (const needle of item.mustNotContain ?? []) {
    if (reply.text.includes(needle)) problems.push(`متن نباید «${needle}» را داشته باشد`);
  }

  check(`«${item.q}»`, problems.length === 0, problems.join('؛ '));
  if (problems.length) {
    console.log(`  ✗ «${item.q}»`);
    for (const problem of problems) console.log(`      ${problem}`);
  }
}

/* ------------------------------------------------------------- ۲) ماسک/بازیابی */

console.log('\nارزیابی ماسک و بازیابی واقعیت‌ها\n');

const sample = '🛍 <b>مانتو کتان</b>\n🏷 کد محصول: <code>PRODMA</code>\n\n• سایز ۳۸ — <b>۶۴۰٬۰۰۰ تومان</b> · ✅ ۳ عدد';
const { masked, facts } = maskFacts(sample);

check('ماسک: عددها و کد پنهان شدند', !/[0-9۰-۹]/.test(masked.replace(/⟦F[A-Z]+⟧/g, '')), masked);
check('ماسک: چهار واقعیت پیدا شد (کد + سه عدد)', facts.length === 4, `facts=${facts.length}`);
check('ماسک: تگ <code> دیده ماند', masked.includes('<code>') && masked.includes('</code>'), masked);

const roundTrip = restoreFacts(masked, facts);
check('بازیابی: رفت‌وبرگشت دقیق', roundTrip.ok && roundTrip.text === sample, roundTrip.ok ? '' : roundTrip.reason);

// جای‌نگه‌دار حذف‌شده باید رد شود.
const dropped = restoreFacts(masked.replace('⟦FB⟧', '…'), facts);
check('بازیابی: حذف جای‌نگه‌دار رد می‌شود', !dropped.ok, dropped.ok ? 'رد نشد' : dropped.reason);

// جای‌نگه‌دار جابه‌جا باید رد شود (قیمت‌ها نباید جابه‌جا شوند).
const swapped = restoreFacts(masked.replace('⟦FB⟧', '⟦TMP⟧').replace('⟦FC⟧', '⟦FB⟧').replace('⟦TMP⟧', '⟦FC⟧'), facts);
check('بازیابی: جابه‌جایی جای‌نگه‌دار رد می‌شود', !swapped.ok, swapped.ok ? 'رد نشد' : swapped.reason);

// جای‌نگه‌دار ساخته‌شده توسط مدل باید رد شود.
const invented = restoreFacts(`${masked} ⟦FZ⟧`, facts);
check('بازیابی: جای‌نگه‌دار ساخته‌شده رد می‌شود', !invented.ok, invented.ok ? 'رد نشد' : invented.reason);

/* ---------------------------------------------------------- ۳) نگهبان بازنویسی */

console.log('\nارزیابی نگهبان بازنویسی\n');

const honestRewrite = '🛍 <b>مانتو کتان</b>\n🏷 کد محصول: <code>PRODMA</code>\n\n• سایز ۳۸ — <b>۶۴۰٬۰۰۰ تومان</b> · ✅ ۳ عدد موجود است';
check('نگهبان: بازنویسی صادقانه قبول می‌شود', guardPolish(sample, honestRewrite).ok);

const priceChanged = honestRewrite.replace('۶۴۰٬۰۰۰', '۵۹۰٬۰۰۰');
check('نگهبان: تغییر قیمت رد می‌شود', !guardPolish(sample, priceChanged).ok);

const codeChanged = honestRewrite.replace('PRODMA', 'PRODX');
check('نگهبان: تغییر کد محصول رد می‌شود', !guardPolish(sample, codeChanged).ok);

const numberAdded = `${honestRewrite}\nارسال رایگان برای سفارش‌های بالای ۵۰۰٬۰۰۰ تومان!`;
check('نگهبان: عدد تازه رد می‌شود', !guardPolish(sample, numberAdded).ok);

/* ------------------------------------------------------------------- خلاصه */

console.log(`\nنتیجه: ${passed} قبول، ${failed} مردود (از ${passed + failed})\n`);
if (failed > 0) {
  console.log('موارد مردود:');
  for (const failure of failures) console.log(`  ✗ ${failure}`);
  process.exit(1);
}
console.log('همه‌ی ارزیابی‌ها سبز شدند.\n');
