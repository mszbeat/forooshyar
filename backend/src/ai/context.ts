import type { CatalogProduct } from '../catalog/discovery';
import { variantsFor, productCodeOf } from '../catalog/discovery';

/**
 * ساخت «بسته‌ی زمینه» برای مدل زبانی.
 *
 * قاعده‌ی طلایی: مدل **فقط** از همین بسته جواب می‌دهد. هر چیزی که در بسته
 * نیست (قیمت، موجودی، رنگ، سیاست مرجوعی) نباید از دهان مدل بیرون بیاید.
 * به همین دلیل قیمت و موجودی همیشه به‌صورت «واقعیت» تزریق می‌شوند، نه
 * به‌عنوان متنی که مدل باید به یاد بیاورد.
 *
 * بودجه‌ی کاراکتر: کاتالوگ بزرگ‌تر از سقف را می‌بُریم و صریح به مدل می‌گوییم
 * که بقیه‌ی محصولات در این فهرست نیستند — همان اصلی که در `discover` هم
 * رعایت شده: «نمی‌دانم» بهتر از «حدس» است.
 */

export type AiShop = {
  name: string;
  tone?: string;
  shipping: string;
  payment: string;
  workingHours: string;
  returns?: string;
  handoffMessage: string;
};

export type AiMessage = { direction: 'in' | 'out'; text: string };

export type AiContextInput = {
  shop: AiShop;
  products: CatalogProduct[];
  history?: AiMessage[];
  /** حداکثر کاراکتر فهرست محصولات (پیش‌فرض ۵۵۰۰). */
  catalogBudget?: number;
  /** حداکثر تعداد پیام‌های تاریخچه (پیش‌فرض ۸). */
  historyLimit?: number;
};

const toman = (value: number) => `${value.toLocaleString('fa-IR')} تومان`;

/** یک خط فشرده برای هر محصول: عنوان، کد، سایز/رنگ‌ها با قیمت و موجودی. */
function productLine(product: CatalogProduct): string {
  const specs = product.variants
    .map(variant => {
      const spec = [variant.size ? `سایز ${variant.size}` : '', variant.color ? `رنگ ${variant.color}` : '']
        .filter(Boolean)
        .join(' / ') || 'بدون سایز';
      const stock = variant.stock > 0 ? `${variant.stock.toLocaleString('fa-IR')} عدد` : 'ناموجود';
      return `${spec} = ${toman(variant.price)} (${stock})`;
    })
    .join(' | ');
  return `• [${productCodeOf(product)}] ${product.title} → ${specs || 'بدون تنوع ثبت‌شده'}`;
}

/**
 * «واقعیت‌ها»: تنها منبع مجاز پاسخ مدل.
 *
 * اولویت‌بندی: محصولات موجود اول می‌آیند تا اگر بودجه تمام شد، محصولات
 * ناموجود حذف شوند، نه محصولات قابل‌فروش.
 */
export function buildFacts(input: AiContextInput): { facts: string; included: number; total: number } {
  const budget = input.catalogBudget ?? 5500;
  const sorted = [...input.products].sort((a, b) => Number(variantsFor(b).length > 0) - Number(variantsFor(a).length > 0));

  const lines: string[] = [];
  let used = 0;
  for (const product of sorted) {
    const line = productLine(product);
    if (used + line.length > budget) break;
    lines.push(line);
    used += line.length + 1;
  }

  const shop = input.shop;
  const facts = [
    `## فروشگاه`,
    `نام: ${shop.name}`,
    `ارسال: ${shop.shipping.trim() || 'ثبت نشده'}`,
    `پرداخت: ${shop.payment.trim() || 'ثبت نشده'}`,
    `ساعت پاسخ‌دهی: ${shop.workingHours.trim() || 'ثبت نشده'}`,
    `مرجوعی: ${shop.returns?.trim() || 'سیاستی ثبت نشده'}`,
    '',
    `## محصولات (${lines.length.toLocaleString('fa-IR')} از ${input.products.length.toLocaleString('fa-IR')})`,
    lines.join('\n') || 'کاتالوگ خالی است.',
  ].join('\n');

  return { facts, included: lines.length, total: input.products.length };
}

/** پیام سیستم: نقش، لحن، و «قواعد سخت» که تخلف از آن‌ها مجاز نیست. */
export function buildSystemPrompt(shop: AiShop): string {
  return [
    `تو دستیار فروش فروشگاه «${shop.name}» هستی و در تلگرام به مشتری فارسی‌زبان جواب می‌دهی.`,
    shop.tone?.trim() ? `لحن فروشنده: ${shop.tone.trim()}` : 'لحن: صمیمی، کوتاه، محترمانه، بدون اغراق.',
    '',
    'قواعد سخت (نقض هرکدام بدترین خطاست):',
    '۱) فقط از «واقعیت‌های» پیام بعدی استفاده کن. اگر قیمت، موجودی یا سیاستی در آن نیست، بگو که باید از فروشنده بپرسی؛ هیچ‌وقت عدد از خودت نساز.',
    '۲) هیچ محصولی را که در فهرست نیست پیشنهاد نکن و هیچ تخفیفی از خودت اعلام نکن.',
    '۳) پاسخ حداکثر ۳ خط کوتاه باشد؛ فارسی روان؛ بدون Markdown، بدون فهرست طولانی.',
    '۴) اگر مشتری نام محصول را نگفته و چند محصول مشابه وجود دارد، به‌جای حدس، اسم ۲ تا ۳ گزینه را بپرس.',
    '۵) سفارش، پرداخت، تخفیف ویژه، شکایت و هر چیز حقوقی را به فروشنده ارجاع بده: «' + (shop.handoffMessage.trim() || 'خدمت فروشنده ارجاع می‌دهم') + '».',
    '۶) هرگز نگو که هوش مصنوعی هستی یا از مدل زبانی استفاده می‌کنی؛ تو دستیار همان فروشگاه هستی.',
  ].join('\n');
}

/** پیام کاربر: تاریخچه‌ی کوتاه + واقعیت‌ها + سؤال تازه. */
export function buildUserPrompt(question: string, facts: string, history: AiMessage[] = [], limit = 8): string {
  const recent = history.slice(-limit);
  const transcript = recent.length
    ? recent.map(message => `${message.direction === 'in' ? 'مشتری' : 'فروشنده'}: ${message.text}`).join('\n')
    : '—';
  return [
    '# واقعیت‌ها (تنها منبع مجاز)',
    facts,
    '',
    '# گفتگوی قبلی',
    transcript,
    '',
    '# پیام تازه‌ی مشتری',
    question,
    '',
    'پاسخ کوتاه فارسی بده.',
  ].join('\n');
}

/**
 * نگهبان خروجی مدل.
 *
 * مدل زبانی می‌تواند با اطمینان کامل عدد اشتباه بگوید؛ قیمت اشتباه بدترین
 * چیزی است که یک دستیار فروش می‌گوید. پس:
 *  - هر عددِ سه‌رقمی‌به‌بالا (یعنی قیمت) باید در واقعیت‌ها وجود داشته باشد.
 *  - پاسخ‌های خالی/خیلی بلند رد می‌شوند.
 */
export function guardAnswer(text: string, facts: string): { ok: boolean; reason?: string } {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length < 6) return { ok: false, reason: 'too_short' };
  if (clean.length > 1200) return { ok: false, reason: 'too_long' };

  const digits = (value: string) => value.replace(/[۰-۹]/g, digit => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit))).replace(/[,٬،\s]/g, '');
  const factsDigits = digits(facts);

  const numbers = clean.match(/[۰-۹0-9][۰-۹0-9,٬،]{2,}/g) ?? [];
  for (const raw of numbers) {
    const value = digits(raw);
    if (value.length >= 3 && !factsDigits.includes(value)) {
      return { ok: false, reason: `price_not_in_catalog:${raw}` };
    }
  }
  return { ok: true };
}
