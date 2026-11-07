import { normalizePersian } from '../fresh/fresh';

/**
 * پیدا کردن محصول از حرف مشتری.
 *
 * چرا این فایل جدا از `answerFresh` است: `answerFresh` عمداً سخت‌گیر است و فقط
 * وقتی جواب می‌دهد که **کل عنوان** داخل جمله باشد؛ چون در داشبورد نمی‌خواهیم
 * حدس زده شود. در بات اما کاربر تایپ می‌کند «این کت چنده» و انتظار دارد لیست
 * محصولات مرتبط را ببیند. این ماژول همان فاصله را پر می‌کند و **هیچ‌وقت
 * خودش انتخاب نمی‌کند**: اگر بیش از یک گزینه بود، لیست را برمی‌گرداند تا از
 * کاربر پرسیده شود.
 */

export type CatalogVariant = {
  id: string;
  size: string;
  color: string;
  price: number;
  stock: number;
};

export type CatalogProduct = {
  id: string;
  title: string;
  code?: string;
  variants: CatalogVariant[];
};

export type Discovery =
  | { kind: 'none' }
  | { kind: 'single'; product: CatalogProduct }
  | { kind: 'many'; products: CatalogProduct[] };

/** کلماتی که «محصول» نیستند؛ اگر در امتیاز شمرده شوند همه‌چیز به همه‌چیز می‌خورد. */
const STOPWORDS = new Set([
  'قیمت', 'قیمتش', 'چنده', 'چند', 'چقدر', 'تومان', 'تومن', 'هزینه', 'مبلغ',
  'موجود', 'موجوده', 'موجودی', 'هست', 'هستش', 'دارید', 'دارین', 'داری', 'داره',
  'سایز', 'اندازه', 'رنگ', 'مدل', 'جنس',
  'این', 'اون', 'آن', 'همین', 'همون', 'یک', 'یه', 'و', 'از', 'با', 'برای', 'را',
  'به', 'در', 'که', 'چی', 'چه', 'کدام', 'کدوم', 'آیا', 'لطفا', 'لطفاً',
  'میخوام', 'می‌خوام', 'میخواستم', 'می‌خواستم', 'بخرم', 'بگیرم', 'خرید', 'سفارش',
  'ارسال', 'پست', 'پیک', 'تحویل', 'پرداخت', 'درگاه', 'کارت',
  'سلام', 'درود', 'وقت', 'بخیر', 'خسته', 'نباشید', 'ممنون', 'مرسی',
  'ها', 'های', 'سفارشت', 'سفارشش',
]);

/** کد کوتاه و خوانای محصول؛ جای uuid در پیام‌های تلگرام. */
export function productCode(id: string): string {
  return id.replace(/-/g, '').slice(0, 6).toUpperCase();
}

export function productCodeOf(product: CatalogProduct): string {
  return product.code ?? productCode(product.id);
}

function tokens(text: string): string[] {
  return normalizePersian(text).split(' ').filter(Boolean);
}

function meaningful(token: string): boolean {
  return token.length >= 2 && !STOPWORDS.has(token);
}

/**
 * امتیاز شباهت عنوان به پرسش: مجموع طول توکن‌های عنوانی که در پرسش آمده.
 * طول توکن وزن است تا «ابریشمی» از «کت» مهم‌تر باشد.
 */
function score(queryTokens: Set<string>, title: string): { score: number; coverage: number } {
  const titleTokens = tokens(title).filter(meaningful);
  if (titleTokens.length === 0) return { score: 0, coverage: 0 };
  let matched = 0;
  let matchedLength = 0;
  for (const token of titleTokens) {
    if (queryTokens.has(token)) {
      matched += 1;
      matchedLength += token.length;
    }
  }
  return { score: matchedLength, coverage: matched / titleTokens.length };
}

/** آیا جمله‌ی مشتری درباره‌ی یک محصول است (نه ارسال/ساعت کاری/سلام)؟ */
export function looksLikeProductQuestion(text: string): boolean {
  const q = normalizePersian(text);
  if (!q) return false;
  return /(قیمت|قیمتش|چنده|چقدر|تومان|تومن|موجود|هست|دارید|دارین|سایز|رنگ|جنس|مدل|خرید|میخوام|می‌خوام|بخرم|سفارش)/u.test(q);
}

const INTENTS_OTHER = /(ارسال|پست|پیک|تحویل|ساعت کاری|ساعت کار|کی باز|کی بسته|پرداخت|کارت به کارت|درگاه)/u;

/**
 * حداقل نسبت توکن‌های عنوان که باید در پرسش باشد.
 * ۰٫۳ عمدی است: «این کت چنده» باید «کت چرم مشکی» (۱ از ۳) را نامزد کند،
 * ولی «سلام» یا «ارسال چنده» نباید هیچ محصولی را نامزد کند.
 */
const MIN_COVERAGE = 0.3;

/**
 * محصول(های) نامزد برای یک پرسش.
 *
 * قاعده‌ی انتخاب آستانه‌دار است، نه «شبیه‌ترین»:
 *  - توکن عنوانی حداقل باید یکی در پرسش باشد و «پوشش» حداقل ۳۴٪ باشد تا
 *    «این کت چنده» محصول «کت چرم مشکی» را نامزد بداند.
 *  - اگر دو نامزد با پوشش نزدیک باشند، تصمیم با کاربر است (kind: 'many').
 */
export function discover(text: string, products: CatalogProduct[], limit = 6): Discovery {
  const q = normalizePersian(text);
  if (!q) return { kind: 'none' };

  const byCode = matchCode(text, products);
  if (byCode) return { kind: 'single', product: byCode };

  const queryTokens = new Set(tokens(text).filter(meaningful));
  if (queryTokens.size === 0) return { kind: 'none' };

  const scored = products
    .map(product => ({ product, ...score(queryTokens, product.title) }))
    .filter(entry => entry.score > 0 && entry.coverage >= MIN_COVERAGE)
    .sort((a, b) => b.score - a.score || b.coverage - a.coverage);

  if (scored.length === 0) return { kind: 'none' };
  if (scored.length === 1) return { kind: 'single', product: scored[0].product };

  // دو محصول با یک نام: تصمیم را به کاربر بده، نه به ضریب حدسی.
  return { kind: 'many', products: scored.slice(0, limit).map(entry => entry.product) };
}

/**
 * کد محصول اگر در متن باشد. `#A1B2C3` یا `a1b2c3` یا `کد A1B2C3`.
 * کد از uuid ساخته می‌شود، پس تصادفاً به محصول دیگری نمی‌خورد.
 */
export function matchCode(text: string, products: CatalogProduct[]): CatalogProduct | null {
  const hex = text.toUpperCase().match(/\b[0-9A-F]{6}\b/g);
  if (!hex) return null;
  for (const token of hex) {
    const found = products.find(product => productCodeOf(product).toUpperCase() === token);
    if (found) return found;
  }
  return null;
}

/** آیا متن به ارسال/ساعت/پرداخت مربوط است و نباید با محصول قاطی شود؟ */
export function asksShopInfo(text: string): boolean {
  return INTENTS_OTHER.test(normalizePersian(text));
}

/** جمع موجودی محصول؛ برای «همه سایزها تمام شده» و انتخاب پیش‌فرض. */
export function totalStock(product: CatalogProduct): number {
  return product.variants.reduce((sum, variant) => sum + Math.max(variant.stock, 0), 0);
}

export function variantsFor(product: CatalogProduct): CatalogVariant[] {
  return product.variants.filter(variant => variant.stock > 0);
}
