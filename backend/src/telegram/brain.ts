import { answerFresh, normalizePersian, type FreshProduct, type FreshShop } from '../fresh/fresh';
import { asksShopInfo, discover, productCodeOf, variantsFor, type CatalogProduct } from '../catalog/discovery';
import { escapeHtml } from './order-flow';

/** دکمه‌ی inline تلگرام؛ یا callback (data) یا لینک (url) — نه هر دو. */
export type BotButton = { text: string; data?: string; url?: string };

export type BotReply = {
  text: string;
  buttons?: BotButton[][];
  kind: 'answer' | 'clarify' | 'handoff' | 'order';
  /** برای آمار و تست: چرا این پاسخ انتخاب شد. */
  reason?: string;
  /** 'HTML' یعنی متن با تگ‌های تلگرام قالب‌بندی شده و مقادیر کاربر escape شده‌اند. */
  parseMode?: 'HTML';
};

export type BrainShop = FreshShop & { name: string };

const toman = (value: number) => `${value.toLocaleString('fa-IR')} تومان`;

function specOf(variant: { size: string; color: string }): string {
  return [variant.size ? `سایز ${variant.size}` : '', variant.color ? `رنگ ${variant.color}` : ''].filter(Boolean).join('، ');
}

function productLine(product: CatalogProduct, index: number): string {
  const inStock = variantsFor(product);
  const cheapest = [...product.variants].sort((a, b) => a.price - b.price)[0];
  const price = cheapest ? `از ${toman(cheapest.price)}` : 'قیمت ثبت نشده';
  const stock = inStock.length > 0 ? `${inStock.length.toLocaleString('fa-IR')} سایز/رنگ موجود` : 'ناموجود';
  return [
    `${NUMERALS[index] ?? `${index + 1}.`} <b>${escapeHtml(product.title)}</b>`,
    `    💰 ${price} · 📦 ${stock}`,
    `    🏷 <code>${productCodeOf(product)}</code>`,
  ].join('\n');
}

/**
 * دکمه‌های انتخاب محصول: **هر محصول یک ردیف**.
 *
 * دو دکمه در یک ردیف باعث می‌شد عنوان‌های فارسی بریده و ناخوانا شوند (در موبایل
 * حتی «کت پشمی» و «کت چرم» شبیه هم دیده می‌شدند). یک ردیف تمام‌عرض، عنوان کامل
 * و شماره‌ی همان ردیف فهرست را نشان می‌دهد.
 */
export function productButtons(products: CatalogProduct[]): BotButton[][] {
  return products.slice(0, 6).map((product, index) => [{
    text: `${NUMERALS[index] ?? `${index + 1}.`} ${product.title} · ${productCodeOf(product)}`,
    data: `p:${product.id}`,
  }]);
}

/** شماره‌های فارسی برای هم‌خوانی دکمه‌ها با فهرست متن. */
const NUMERALS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣'];

/** دکمه‌های «ثبت سفارش» برای سایز/رنگ‌های موجود. */
export function orderButtons(product: CatalogProduct): BotButton[][] {
  const available = variantsFor(product).slice(0, 5);
  return available.map(variant => [{
    text: `🛒 سفارش · ${specOf(variant) || 'بدون سایز'} · ${variant.price.toLocaleString('fa-IR')} تومان`,
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
      parseMode: 'HTML',
      text: [
        `🙁 <b>${escapeHtml(product.title)}</b> با ${escapeHtml([askedSize ? `سایز ${askedSize}` : '', askedColor ? `رنگ ${askedColor}` : ''].filter(Boolean).join(' و '))} ثبت نشده است.`,
        '',
        available.length ? `<b>گزینه‌های ثبت‌شده:</b>\n${available.map(item => `• ${escapeHtml(item)}`).join('\n')}` : 'هنوز سایز و رنگی برای این محصول ثبت نشده است.',
      ].join('\n'),
      buttons: orderButtons(product),
    };
  }

  const targets = matching.length > 0 ? matching : product.variants;
  const lines = [
    `🛍 <b>${escapeHtml(product.title)}</b>`,
    `🏷 کد محصول: <code>${productCodeOf(product)}</code>`,
    '',
    askedSize || askedColor ? '<b>گزینه‌های منطبق</b>' : '<b>موجودی و قیمت</b>',
  ];
  for (const variant of targets.slice(0, 8)) {
    const spec = specOf(variant) || 'بدون سایز/رنگ';
    const stock = variant.stock > 0 ? `✅ ${variant.stock.toLocaleString('fa-IR')} عدد` : '❌ ناموجود';
    lines.push(`• ${escapeHtml(spec)} — <b>${toman(variant.price)}</b> · ${stock}`);
  }
  if (wantsPrice || wantsStock) lines.push('', '👇 برای ثبت سفارش یکی از دکمه‌های زیر را بزنید.');

  return {
    kind: 'answer',
    reason: wantsPrice ? 'price' : wantsStock ? 'stock' : 'product',
    parseMode: 'HTML',
    text: lines.join('\n'),
    buttons: orderButtons(product),
  };
}

/** پیام رفع ابهام: چند محصول نامزد + راهنمای کد. */
export function clarifyProducts(products: CatalogProduct[], query: string): BotReply {
  return {
    kind: 'clarify',
    reason: 'ambiguous',
    parseMode: 'HTML',
    text: [
      `🤔 «<i>${escapeHtml(query.trim().slice(0, 60))}</i>» به بیش از یک محصول می‌خورد.`,
      '',
      products.slice(0, 6).map((product, index) => productLine(product, index)).join('\n\n'),
      '',
      '👇 یکی را از دکمه‌های زیر انتخاب کنید، یا نام دقیق/کد محصول را بفرستید.',
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
