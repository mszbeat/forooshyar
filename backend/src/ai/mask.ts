/**
 * ماسک‌کردن واقعیت‌ها پیش از بازنویسی لحن.
 *
 * چرا: نگهبانِ بعد از بازنویسی (`guardPolish`) فقط «عددها عوض نشده‌اند» را
 * بررسی می‌کند؛ ولی اگر مدل از اول عددها را نبیند، اصلاً نمی‌تواند آن‌ها را
 * عوض کند. پس پیش از فرستادن متن به مدل، هر عدد و کد محصول با یک
 * جای‌نگه‌دار (`⟦FA⟧`، `⟦FB⟧`…) جایگزین می‌شود؛ مدل فقط لحن را می‌سازد و
 * بعد از برگشتن متن، جای‌نگه‌دارها با مقدار اصلی پر می‌شوند.
 *
 * جای‌نگه‌دارها عمداً فقط از حروف ساخته می‌شوند (بدون رقم) تا الگوی عددها
 * آن‌ها را دوباره نگیرد، و با براکت‌های خاص (`⟦ ⟧`) از متن فارسی جدا هستند.
 *
 * بازیابی (`restoreFacts`) سخت‌گیر است: هر جای‌نگه‌دار باید دقیقاً یک‌بار و
 * به همان ترتیبِ متن اصلی آمده باشد؛ وگرنه بازنویسی رد می‌شود و همان متن
 * اصلی به مشتری می‌رسد.
 */

export type MaskedFact = { placeholder: string; value: string };
export type MaskResult = { masked: string; facts: MaskedFact[] };

/** جای‌نگه‌دار شماره‌دار با حروف: ⟦FA⟧، ⟦FB⟧، …، ⟦FZ⟧، ⟦FAA⟧ */
function placeholderFor(index: number): string {
  let letters = '';
  let value = index;
  while (value > 0) {
    value -= 1;
    letters = String.fromCharCode(65 + (value % 26)) + letters;
    value = Math.floor(value / 26);
  }
  return `⟦F${letters}⟧`;
}

const PLACEHOLDER_RE = /⟦F[A-Z]+⟧/g;

export interface MaskOptions {
  /** نام‌های محصول که نباید مدل آن‌ها را عوض کند. */
  productTitles?: string[];
  /** SKUها و کدهای سفارش. */
  skus?: string[];
}

/**
 * همه‌ی واقعیت‌های متن (کدهای محصول، نام محصول، SKU، URL، تلفن و عددها)
 * را با جای‌نگه‌دار عوض می‌کند.
 * ترتیب ماسک مهم است: اول کدها و نام‌ها (چون ممکن است عدد هم داشته باشند)،
 * بعد URL/تلفن، و در آخر عددها.
 */
export function maskFacts(text: string, options: MaskOptions = {}): MaskResult {
  const facts: MaskedFact[] = [];
  let counter = 0;
  const push = (value: string): string => {
    counter += 1;
    const placeholder = placeholderFor(counter);
    facts.push({ placeholder, value });
    return placeholder;
  };

  let masked = text;

  // ۱) محتوای داخل <code> — خود تگ دیده می‌ماند تا ساختار پیام حفظ شود.
  masked = masked.replace(/<code>([^<]+)<\/code>/g, (_match, code: string) => `<code>${push(code)}</code>`);

  // ۲) نام محصولات و SKUها (از روی کاتالوگ داده می‌شوند).
  const titles = (options.productTitles ?? [])
    .filter(title => title.trim().length >= 2)
    .sort((a, b) => b.length - a.length);
  for (const title of titles) {
    if (masked.includes(title)) {
      masked = masked.split(title).join(push(title));
    }
  }
  const skus = (options.skus ?? []).filter(sku => sku.trim().length >= 3);
  for (const sku of skus) {
    if (masked.includes(sku)) {
      masked = masked.split(sku).join(push(sku));
    }
  }

  // ۳) URLها و شماره‌های تلفن/موبایل.
  masked = masked.replace(/https?:\/\/[^\s<]+/g, match => push(match));
  masked = masked.replace(/(?:\+?98|0)?9\d{9}/g, match => push(match));

  // ۴) همه‌ی عددها (فارسی و لاتین) — همان الگوی نگهبان بازنویسی.
  masked = masked.replace(/[0-9۰-۹][0-9۰-۹٬,.]*/g, match => push(match));

  return { masked, facts };
}

export type RestoreResult = { ok: true; text: string } | { ok: false; reason: string };

/**
 * برگرداندن مقدارهای اصلی به جای‌نگه‌دارها.
 *
 * سه شرط هم‌زمان:
 *  - تعداد جای‌نگه‌دارها دقیقاً به‌اندازه‌ی واقعیت‌ها باشد (نه حذف، نه اضافه).
 *  - ترتیب آن‌ها مثل متن اصلی باشد (قیمت‌ها جابه‌جا نشوند).
 *  - هیچ جای‌نگه‌دار ناشناخته‌ای (ساخته‌ی مدل) در متن نباشد.
 */
export function restoreFacts(rewritten: string, facts: MaskedFact[]): RestoreResult {
  const found = rewritten.match(PLACEHOLDER_RE) ?? [];
  const expected = facts.map(fact => fact.placeholder);

  if (found.length !== expected.length) {
    return { ok: false, reason: `placeholder_count:${found.length}!=${expected.length}` };
  }
  for (let index = 0; index < expected.length; index += 1) {
    if (found[index] !== expected[index]) {
      return { ok: false, reason: `placeholder_order:${expected[index]}` };
    }
  }

  let text = rewritten;
  for (const fact of facts) {
    // تابع جایگزین: مقدار ممکن است `$` داشته باشد که در replace معنای خاص دارد.
    text = text.replace(fact.placeholder, () => fact.value);
  }
  return { ok: true, text };
}
