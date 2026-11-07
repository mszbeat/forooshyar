import { answerFresh, normalizePersian, type FreshProduct, type FreshShop } from '../fresh/fresh';
import { asksShopInfo, discover, productCodeOf, variantsFor, type CatalogProduct } from '../catalog/discovery';

/** دکمه‌ی inline تلگرام؛ یا callback (data) یا لینک (url) — نه هر دو. */
export type BotButton = { text: string; data?: string; url?: string };

export type BotReply = {
  text: string;
  buttons?: BotButton[][];
  kind: 'answer' | 'clarify' | 'handoff' | 'order';
  /** برای آمار و تست: چرا این پاسخ انتخاب شد. */
  reason?: string;
};

export type BrainShop = FreshShop & { name: string };

const toman = (value: number) => `${value.toLocaleString('fa-IR')} تومان`;

function specOf(variant: { size: string; color: string }): string {
  return [variant.size ? `سایز ${variant.size}` : '', variant.color ? `رنگ ${variant.color}` : ''].filter(Boolean).join('، ');
}

function productLine(product: CatalogProduct): string {
  const inStock = variantsFor(product);
  const cheapest = [...product.variants].sort((a, b) => a.price - b.price)[0];
  const price = cheapest ? ` · از ${toman(cheapest.price)}` : '';
  const stock = inStock.length > 0 ? ` · ${inStock.length.toLocaleString('fa-IR')} سایز/رنگ موجود` : ' · ناموجود';
  return `${product.title}${price}${stock}\nکد: ${productCodeOf(product)}`;
}

/** دکمه‌های انتخاب محصول برای رفع ابهام؛ حداکثر ۶ گزینه، دو تا در هر ردیف. */
export function productButtons(products: CatalogProduct[]): BotButton[][] {
  const rows: BotButton[][] = [];
  const slice = products.slice(0, 6);
  for (let index = 0; index < slice.length; index += 2) {
    rows.push(slice.slice(index, index + 2).map(product => ({
      // عنوان دکمه کوتاه می‌شود؛ تلگرام متن بلند را می‌برد.
      text: product.title.length > 28 ? `${product.title.slice(0, 27)}…` : product.title,
      data: `p:${product.id}`,
    })));
  }
  return rows;
}

/** دکمه‌های «ثبت سفارش» برای سایز/رنگ‌های موجود. */
export function orderButtons(product: CatalogProduct): BotButton[][] {
  const available = variantsFor(product).slice(0, 5);
  return available.map(variant => [{
    text: `🛒 ثبت سفارش${specOf(variant) ? ` · ${specOf(variant)}` : ''}`,
    data: `ord:${variant.id}`,
  }]);
}

/**
 * پاسخ به سؤال محصول. وقتی دقیقاً یک محصول نامزد است.
 *
 * اگر مشتری سایز/رنگی گفته که وجود ندارد، به‌جای حدس زدن، گزینه‌های واقعی را
 * نشان می‌دهیم — همان اصل «هیچ حدسی نمی‌زنیم» که در داشبورد هم رعایت شده.
 */
export function describeProduct(product: CatalogProduct, query: string): BotReply {
  const q = normalizePersian(query);
  const wantsPrice = /(قیمت|قیمتش|چنده|چقدر|تومان|تومن)/u.test(q);
  const wantsStock = /(موجود|هست|دارید|دارین|داره)/u.test(q);

  // سایز/رنگ را از متن **اصلی** می‌خوانیم تا حرف بزرگ کاربر (XL) در پاسخ حفظ شود؛
  // برای مقایسه از نسخه‌ی نرمال‌شده استفاده می‌شود.
  const sizeRequest = query.match(/سایز\s+(?:های\s+|رو\s+|به\s+)?([\p{L}\p{N}]+)/u)?.[1];
  const colorRequest = query.match(/رنگ\s+(?:های\s+|رو\s+|به\s+)?([\p{L}\p{N}]+)/u)?.[1];
  const ignored = new Set(['داره', 'دارید', 'دارین', 'موجوده', 'موجود', 'هست', 'چنده', 'قیمت', 'چی', 'چه']);
  const askedSize = sizeRequest && !ignored.has(normalizePersian(sizeRequest)) ? sizeRequest : '';
  const askedColor = colorRequest && !ignored.has(normalizePersian(colorRequest)) ? colorRequest : '';
  const sizeKey = normalizePersian(askedSize);
  const colorKey = normalizePersian(askedColor);

  const matching = product.variants.filter(variant =>
    (!sizeKey || normalizePersian(variant.size).split(' ').includes(sizeKey)) &&
    (!colorKey || normalizePersian(variant.color).split(' ').includes(colorKey)),
  );

  if ((askedSize || askedColor) && matching.length === 0) {
    const available = product.variants
      .map(variant => [variant.size ? `سایز ${variant.size}` : '', variant.color ? `رنگ ${variant.color}` : ''].filter(Boolean).join(' / '))
      .filter(Boolean);
    return {
      kind: 'clarify',
      reason: 'variant_not_found',
      text: [
        `${product.title} با ${[askedSize ? `سایز ${askedSize}` : '', askedColor ? `رنگ ${askedColor}` : ''].filter(Boolean).join(' و ')} ثبت نشده است.`,
        available.length ? `گزینه‌های ثبت‌شده:\n${available.map(item => `• ${item}`).join('\n')}` : 'هنوز سایز و رنگی برای این محصول ثبت نشده است.',
      ].join('\n'),
      buttons: orderButtons(product),
    };
  }

  const targets = matching.length > 0 ? matching : product.variants;
  const lines = [`${product.title}`, askedSize || askedColor ? `گزینه‌های منطبق:` : 'موجودی و قیمت:'];
  for (const variant of targets.slice(0, 8)) {
    const spec = specOf(variant) || 'بدون سایز/رنگ';
    const stock = variant.stock > 0 ? `${variant.stock.toLocaleString('fa-IR')} عدد موجود` : 'ناموجود';
    lines.push(`• ${spec}: ${toman(variant.price)} — ${stock}`);
  }
  lines.push(`کد محصول: ${productCodeOf(product)}`);
  if (wantsPrice || wantsStock) lines.push('برای ثبت سفارش یکی از دکمه‌های زیر را بزنید.');

  return {
    kind: 'answer',
    reason: wantsPrice ? 'price' : wantsStock ? 'stock' : 'product',
    text: lines.join('\n'),
    buttons: orderButtons(product),
  };
}

/** پیام رفع ابهام: چند محصول نامزد + راهنمای کد. */
export function clarifyProducts(products: CatalogProduct[], query: string): BotReply {
  return {
    kind: 'clarify',
    reason: 'ambiguous',
    text: [
      `«${query.trim().slice(0, 60)}» به بیش از یک محصول می‌خورد.`,
      'منظورتان کدام است؟ یکی را از دکمه‌های زیر انتخاب کنید:',
      '',
      products.slice(0, 6).map(product => `• ${productLine(product)}`).join('\n\n'),
      '',
      'یا نام دقیق محصول، یا کد آن را بفرستید.',
    ].join('\n'),
    buttons: productButtons(products),
  };
}

/**
 * تصمیم نهایی برای یک پیام متنی مشتری.
 *
 * ترتیب عمدی است: اول محصول (چون واژه‌های محصول در جمله‌های واقعی زیاد است)،
 * بعد دانش فروشگاه (ارسال/پرداخت/ساعت) و در آخر ارجاع به انسان.
 */
export function composeReply(text: string, shop: BrainShop, products: CatalogProduct[]): BotReply {
  // ۰) سؤال‌های سطح فروشگاه (ارسال/پرداخت/ساعت) اول جواب می‌گیرند: جمله‌ای مثل
  // «هزینه ارسال شال ابریشمی چنده» درباره‌ی ارسال است، نه قیمت شال.
  const q = normalizePersian(text);
  if (/(ارسال|پست|پیک|تحویل)/u.test(q) && shop.shipping.trim()) {
    return { kind: 'answer', reason: 'shipping', text: shop.shipping.trim() };
  }
  if (/(پرداخت|کارت به کارت|درگاه)/u.test(q) && shop.payment.trim()) {
    return { kind: 'answer', reason: 'payment', text: shop.payment.trim() };
  }
  if (/(ساعت کاری|ساعت کار|کی باز|کی بسته)/u.test(q) && shop.workingHours.trim()) {
    return { kind: 'answer', reason: 'hours', text: shop.workingHours.trim() };
  }

  const discovery = discover(text, products);

  if (discovery.kind === 'many') {
    return clarifyProducts(discovery.products, text);
  }

  if (discovery.kind === 'single') {
    // «هزینه ارسال این محصول چنده؟» درباره‌ی ارسال است، نه قیمت محصول.
    if (asksShopInfo(text)) {
      const fresh = answerFresh(text, shop, products as unknown as FreshProduct[]);
      if (fresh.kind === 'answer') return { kind: 'answer', reason: 'shop_info', text: fresh.text };
    }
    return describeProduct(discovery.product, text);
  }

  const fresh = answerFresh(text, shop, products as unknown as FreshProduct[]);
  if (fresh.kind === 'clarify') {
    // answerFresh بدون نامزد مشخص «نام دقیق را بگو» می‌گوید؛ دکمه‌ای برای نشان
    // دادن نداریم، پس همان متن را با راهنمای کد محصول همراه می‌کنیم.
    return { kind: 'clarify', reason: 'fresh_clarify', text: fresh.text };
  }
  return { kind: fresh.kind, reason: 'fresh', text: fresh.text };
}
