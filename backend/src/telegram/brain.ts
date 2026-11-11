import { normalizePersian, type FreshShop } from '../fresh/fresh';
import { discover, productCodeOf, productTokens, suggest, totalStock, variantsFor, type CatalogProduct } from '../catalog/discovery';
import { escapeHtml } from './order-flow';
import {
  clarifyOptions, detectIntents, MAX_CLARIFY_ROUNDS, needsHuman,
  type ClarifyOption, type IntentId,
} from './understanding';

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
  /**
   * پرسشی که این پیام بر اساس آن ساخته شده. سرویس آن را در وضعیت گفتگو ذخیره
   * می‌کند تا دکمه‌های «بعدی/قبلی» بتوانند همان فهرست را دوباره بسازند.
   */
  listQuery?: string;
  /** لیست صفحه‌بندی‌شده: فقط محصولات این صفحه. */
  pageInfo?: { page: number; pages: number; total: number };
};

export type BrainShop = FreshShop & { name: string; returns?: string };

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
    `${numeral(index)} <b>${escapeHtml(product.title)}</b>`,
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
export function productButtons(products: CatalogProduct[], offset = 0): BotButton[][] {
  return products.slice(0, PAGE_SIZE).map((product, index) => [{
    text: `${numeral(offset + index)} ${product.title} · ${productCodeOf(product)}`,
    data: `p:${product.id}`,
  }]);
}

/**
 * چند محصول در هر صفحه.
 *
 * ۸ عدد تجربی است: در تلگرام دسکتاپ و موبایل یک اسکرول کوتاه، و برای فهرست
 * دکمه‌های تمام‌عرض بدون اینکه بقیه‌ی گفتگو را از دید خارج کند.
 */
export const PAGE_SIZE = 8;

/** شماره‌های فارسی برای هم‌خوانی دکمه‌ها با فهرست متن. */
const NUMERALS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣'];

function numeral(index: number): string {
  return NUMERALS[index] ?? `${(index + 1).toLocaleString('fa-IR')}.`;
}

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
      buttons: orderButtons(product).length ? orderButtons(product) : [[{ text: '🔔 اگر موجود شد خبرم کن', data: `watch:${product.id}` }]],
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
  const choices = orderButtons(product);
  if (wantsPrice || wantsStock) {
    lines.push('', choices.length
      ? '👇 برای ثبت سفارش یکی از گزینه‌های موجود را انتخاب کنید.'
      : '😔 فعلاً هیچ‌کدام از گزینه‌های این محصول موجود نیست. برای اینکه هنگام شارژ خبرتان کنیم، «خبرم کن» بنویسید.');
  }

  return {
    kind: choices.length ? 'answer' : 'clarify',
    reason: choices.length ? (wantsPrice ? 'price' : wantsStock ? 'stock' : 'product') : 'out_of_stock',
    parseMode: 'HTML',
    text: lines.join('\n'),
    buttons: choices.length ? choices : [[{ text: '🔔 اگر موجود شد خبرم کن', data: `watch:${product.id}` }]],
  };
}

/**
 * «محصولی با این عنوان نداریم».
 *
 * چرا این پیام لازم است: قبلاً اگر مشتری نام محصولی را می‌گفت که در کاتالوگ
 * نبود، بات می‌پرسید «قیمت کدام محصول؟» — یعنی حرف مشتری را نشنیده می‌گرفت.
 * حالا صریح می‌گوید پیدا نشد، و اگر محصولی شبیه آن باشد چند گزینه پیشنهاد
 * می‌دهد تا مشتری با یک دکمه به آن برسد.
 */
export function notFoundReply(query: string, products: CatalogProduct[]): BotReply {
  const near = suggest(query, products);
  const asked = query.trim().slice(0, 60);
  const lines = [
    `🔍 محصولی با عنوان «<i>${escapeHtml(asked)}</i>» در کاتالوگ فروشگاه نیست.`,
    '',
    'می‌توانید نام دقیق محصول یا کد آن را بفرستید؛ اگر محصول تازه‌ای منتظرتان است، فروشنده هم می‌تواند اضافه کند.',
  ];
  if (near.length) {
    lines.splice(2, 0, 'شاید منظورتان یکی از این‌ها باشد:');
    lines.splice(3, 0, near.map((product, index) => productLine(product, index)).join('\n\n'));
  }
  return {
    kind: near.length ? 'clarify' : 'answer',
    reason: 'product_not_found',
    parseMode: 'HTML',
    text: lines.join('\n'),
    buttons: near.length ? productButtons(near) : products.length ? productButtons(products.slice(0, PAGE_SIZE)) : undefined,
    listQuery: near.length ? '' : undefined,
  };
}

/**
 * محصول هست ولی موجودی‌اش صفر است.
 *
 * دکمه‌ی «خبرم کن» یک درخواست واقعی می‌سازد (`StockAlert`); به‌محض اینکه
 * فروشنده موجودی را زیاد کند، همین مشتری در تلگرام پیام می‌گیرد.
 */
export function outOfStockReply(product: CatalogProduct): BotReply {
  const lastPrice = [...product.variants].sort((a, b) => a.price - b.price)[0];
  return {
    kind: 'clarify',
    reason: 'out_of_stock',
    parseMode: 'HTML',
    text: [
      `😔 موجودی <b>${escapeHtml(product.title)}</b> تمام شده است.`,
      lastPrice ? `آخرین قیمت ثبت‌شده: ${toman(lastPrice.price)}` : '',
      '',
      'اگر موجود شود خبرتان می‌کنم؛ کافی است دکمه‌ی زیر را بزنید.',
    ].filter(Boolean).join('\n'),
    buttons: [[{ text: '🔔 اگر موجود شد خبرم کن', data: `watch:${product.id}` }]],
  };
}

/**
 * فهرست محصولات نامزد، صفحه‌به‌صفحه.
 *
 * چرا صفحه‌بندی: قبلاً فقط ۶ محصول اول فرستاده می‌شد و اگر مشتری ۱۰ کفش داشت،
 * بقیه عملاً از دسترس خارج می‌شدند. حالا همه‌ی نامزدها با ۸ مورد در هر صفحه
 * می‌آیند و دکمه‌ی «بعدی/قبلی» کاربر را به بقیه می‌رساند.
 */
export function clarifyProducts(products: CatalogProduct[], query: string, page = 0): BotReply {
  const pages = Math.max(1, Math.ceil(products.length / PAGE_SIZE));
  const current = Math.min(Math.max(page, 0), pages - 1);
  const offset = current * PAGE_SIZE;
  const slice = products.slice(offset, offset + PAGE_SIZE);

  const header = [
    `🔎 «<i>${escapeHtml(query.trim().slice(0, 60))}</i>»`,
    products.length > 1
      ? `<b>${products.length.toLocaleString('fa-IR')} محصول</b> مرتبط پیدا شد.`
      : '<b>یک محصول</b> مرتبط پیدا شد.',
  ];
  if (pages > 1) header.push(`صفحه‌ی ${(current + 1).toLocaleString('fa-IR')} از ${pages.toLocaleString('fa-IR')}`);

  const buttons = productButtons(slice, offset);
  if (pages > 1) {
    const nav: BotButton[] = [];
    if (current > 0) nav.push({ text: '◀ قبلی', data: `pg:${current - 1}` });
    if (current < pages - 1) nav.push({ text: `بعدی ▶`, data: `pg:${current + 1}` });
    if (nav.length) buttons.push(nav);
  }

  return {
    kind: pages > 1 || products.length > 1 ? 'clarify' : 'answer',
    reason: 'ambiguous',
    parseMode: 'HTML',
    text: [
      header.join('\n'),
      '',
      slice.map((product, index) => productLine(product, offset + index)).join('\n\n'),
      '',
      products.length > 1
        ? '👇 یکی را از دکمه‌های زیر انتخاب کنید، یا نام دقیق/کد محصول را بفرستید.'
        : '👇 برای دیدن سایز/رنگ و ثبت سفارش، دکمه‌ی زیر را بزنید.',
    ].join('\n'),
    buttons,
    listQuery: query.trim(),
    pageInfo: { page: current, pages, total: products.length },
  };
}

/** پیام ارجاع به انسان (فقط وقتی واقعاً لازم است). */
function handoffReply(shop: BrainShop, reason: string): BotReply {
  return {
    kind: 'handoff',
    reason,
    text: shop.handoffMessage.trim() || 'برای پاسخ دقیق‌تر با فروشنده هماهنگ می‌کنم.',
  };
}

/** متن دکمه‌ها به callback تبدیل می‌شود؛ سرویس آن را می‌شناسد. */
export function clarifyButtons(options: ClarifyOption[]): BotButton[][] {
  const rows: BotButton[][] = [];
  for (let index = 0; index < options.length; index += 2) {
    rows.push(options.slice(index, index + 2).map(option => ({ text: option.label, data: `cl:${option.id}` })));
  }
  return rows;
}

/** پیام «منظورتان را دقیق‌تر بگویید» — با دکمه، نه ارجاع. */
export function askClarify(shop: BrainShop, products: CatalogProduct[], round: number): BotReply {
  const options = clarifyOptions({
    shipping: Boolean(shop.shipping.trim()),
    payment: Boolean(shop.payment.trim()),
    hours: Boolean(shop.workingHours.trim()),
    returns: Boolean(shop.returns?.trim()),
    products: products.length > 0,
  });
  const opener = round === 0
    ? '🤔 مطمئن نشدم دقیقاً چه چیزی می‌خواهید.'
    : '🙂 هنوز مطمئن نشدم منظورتون چیه.';
  return {
    kind: 'clarify',
    reason: `unclear_${round + 1}`,
    parseMode: 'HTML',
    text: [
      opener,
      '',
      options.length
        ? 'یکی از گزینه‌های زیر را بزنید، یا جمله‌تان را یک‌جور دیگر بنویسید:'
        : 'مثلاً بنویسید «قیمت این محصول چنده؟» یا «ارسال چند روزه است؟»',
    ].join('\n'),
    buttons: options.length ? clarifyButtons(options) : undefined,
  };
}

/** پاسخ یک مفهوم مشخص (برای دکمه‌های سؤال روشن‌کننده). */
export function answerIntent(intent: IntentId, shop: BrainShop, products: CatalogProduct[]): BotReply | null {
  const data: Partial<Record<IntentId, string>> = {
    shipping: shop.shipping.trim(),
    payment: shop.payment.trim(),
    hours: shop.workingHours.trim(),
    returns: (shop.returns ?? '').trim(),
  };
  const value = data[intent];
  if (value) return { kind: 'answer', reason: `intent_${intent}`, text: value };

  if (intent === 'order') {
    if (products.length === 0) return null;
    return {
      kind: 'clarify',
      reason: 'catalog',
      text: 'کدام محصول را می‌خواهید سفارش بدهید؟',
      buttons: productButtons(products),
    };
  }
  if (intent === 'price' || intent === 'size') {
    if (products.length === 0) return null;
    return {
      kind: 'clarify',
      reason: 'needs_product',
      parseMode: 'HTML',
      text: intent === 'price'
        ? '💰 قیمت و موجودی کدام محصول را می‌خواهید بدانید؟'
        : '📏 سایز و رنگ کدام محصول را می‌خواهید بدانید؟',
      buttons: productButtons(products),
    };
  }
  return null;
}

/** سلام و احوال‌پرسی کوتاه، بدون ارجاع. */
function greetingReply(shop: BrainShop, products: CatalogProduct[]): BotReply {
  const capabilities = [
    products.length ? 'قیمت و موجودی محصول‌ها' : '',
    shop.shipping.trim() ? 'ارسال و تحویل' : '',
    shop.payment.trim() ? 'روش‌های پرداخت' : '',
    shop.workingHours.trim() ? 'ساعت کاری' : '',
  ].filter(Boolean);
  return {
    kind: 'answer',
    reason: 'greeting',
    parseMode: 'HTML',
    text: [
      `👋 سلام! به «${escapeHtml(shop.name)}» خوش آمدید.`,
      capabilities.length ? `می‌توانم درباره‌ی ${capabilities.join('، ')} کمکتان کنم.` : 'در خدمتم.',
      'هر سؤالی داشتید بپرسید.',
    ].join('\n'),
  };
}

/**
 * تصمیم نهایی برای یک پیام متنی مشتری.
 *
 * ترتیب عمدی است:
 *  ۱) شکایت/درخواست صریح انسان → ارجاع (سؤال پرسیدن از مشتری عصبانی درست نیست).
 *  ۲) هر مفهوم قابل‌پاسخ (ساعت کاری، ارسال، پرداخت، مرجوعی) **همان‌جا جواب
 *     می‌گیرد** — قبلاً جمله‌ای مثل «تایم کاری» به فروشنده ارجاع می‌شد.
 *  ۳) محصول: نامزد یکتا → قیمت/موجودی؛ چند نامزد → دکمه‌ی انتخاب؛ بدون نامزد →
 *     «قیمت کدام محصول؟» با دکمه — نه ارجاع.
 *  ۴) اگر هیچ‌کدام تشخیص داده نشد → سؤال روشن‌کننده؛ بعد از ۳ بار → ارجاع.
 */
export function composeReply(
  text: string,
  shop: BrainShop,
  products: CatalogProduct[],
  options: { round?: number; page?: number } = {},
): BotReply {
  const round = options.round ?? 0;
  const hits = detectIntents(text);
  if (needsHuman(hits)) return handoffReply(shop, 'human_request');
  // سؤال مشخص درباره‌ی رایگان‌بودن ارسال را با متن کلیِ روش/زمان ارسال
  // پاسخ نمی‌دهیم؛ مگر اینکه فروشنده صریحاً «رایگان» را در سیاستش ثبت کرده باشد.
  const shippingFreeQuestion = /(ارسال|پست|تحویل).{0,24}رایگان|رایگان.{0,24}(ارسال|پست|تحویل)/u.test(normalizePersian(text));
  if (shippingFreeQuestion && !/رایگان/u.test(normalizePersian(shop.shipping))) {
    return handoffReply(shop, 'shipping_free_not_specified');
  }

  // امتیاز نیم (واژه‌ی مبهم مثل «چند») به‌تنهایی دلیل پاسخ نیست.
  const intents = hits.filter(hit => hit.score >= 1).map(hit => hit.id);
  const has = (id: IntentId) => intents.includes(id);

  const parts: string[] = [];
  let buttons: BotButton[][] = [];
  // پاسخِ محصول (قیمت/موجودی) برای نگه‌داشتن دلیل دقیق در `reason`.
  let reply: BotReply | null = null;
  let productReason = '';

  // محصول.
  // اگر جمله صریحاً درباره‌ی یک موضوع فروشگاهی است («ساعت کاریتون چنده؟»،
  // «هزینه ارسال چقدره»)، «چنده/چقدر» را قیمت محصول نمی‌خوانیم — وگرنه بات
  // بی‌دلیل می‌پرسد «قیمت کدام محصول؟».
  const shopStrong = hits.some(hit => hit.score >= 3 && ['shipping', 'payment', 'hours', 'returns'].includes(hit.id));
  if (intents.some(id => id === 'price' || id === 'stock' || id === 'size')) {
    const discovery = discover(text, products);
    if (discovery.kind === 'many') {
      const reply = clarifyProducts(discovery.products, text, options.page ?? 0);
      parts.push(reply.text);
      buttons = reply.buttons ?? [];
    } else if (discovery.kind === 'single') {
      // محصول پیدا شد؛ اگر هیچ سایز/رنگی موجود نیست، «موجودی تمام شده» + دکمه‌ی خبر.
      reply = totalStock(discovery.product) === 0
        ? outOfStockReply(discovery.product)
        : describeProduct(discovery.product, text);
      productReason = reply.reason ?? '';
      parts.push(reply.text);
      buttons = reply.buttons ?? [];
    } else if (productTokens(text).length > 0 && !shopStrong) {
      // نام محصول گفته شد ولی در کاتالوگ نیست → صریح بگو پیدا نشد.
      // فقط نام محصول نقل می‌شود، نه کل جمله («قیمت»، «چنده» و…).
      reply = notFoundReply(productTokens(text).join(' '), products);
      productReason = reply.reason ?? '';
      parts.push(reply.text);
      buttons = reply.buttons ?? [];
    } else if (products.length > 0 && !shopStrong) {
      // قیمت/موجودی بدون نام محصول: از مشتری می‌پرسیم، به فروشنده ارجاع نمی‌دهیم.
      const ask = answerIntent(has('price') ? 'price' : 'size', shop, products);
      if (ask) {
        parts.push(ask.text);
        buttons = ask.buttons ?? [];
      }
    }
  }

  // دانش فروشگاه — همه‌ی موضوع‌های تشخیص‌داده‌شده جواب می‌گیرند.
  const shopPart = (id: IntentId, value: string, emoji: string) => {
    if (value.trim()) parts.push(`${emoji} ${value.trim()}`);
  };
  if (!parts.length || has('shipping') || has('payment') || has('hours') || has('returns')) {
    if (has('hours')) shopPart('hours', shop.workingHours, '🕒');
    if (has('shipping')) shopPart('shipping', shop.shipping, '🚚');
    if (has('payment')) shopPart('payment', shop.payment, '💳');
    if (has('returns')) shopPart('returns', shop.returns ?? '', '↩️');
  }

  if (has('discount') && !shop.returns?.trim()) {
    parts.push('🎁 برای تخفیف و کدهای ویژه، فروشنده بهترین گزینه را می‌گوید — همین‌جا پیام بگذارید.');
  }

  if (has('order') && products.length > 0 && parts.length === 0) {
    parts.push('🛒 کدام محصول را می‌خواهید؟');
    buttons = productButtons(products);
  }

  if (parts.length > 0) {
    return {
      kind: buttons.length ? 'clarify' : 'answer',
      // وقتی فقط پاسخ محصول آمده، دلیل دقیق‌تر آن را نگه می‌داریم
      // (`out_of_stock` / `product_not_found` / `price`).
      reason: parts.length === 1 && productReason ? productReason : `answer_${intents.join('_') || 'product'}`,
      text: parts.join('\n\n'),
      buttons: buttons.length ? buttons : undefined,
    };
  }

  // سلام/تشکر تنها
  if (has('greeting')) return greetingReply(shop, products);
  if (has('thanks')) {
    return { kind: 'answer', reason: 'thanks', text: '🙏 خواهش می‌کنم! هر وقت سؤالی داشتید در خدمتم.' };
  }

  // هیچ پاسخ قابل‌اتکایی پیدا نشد.
  //
  // «فهمیدم ولی داده‌اش را ندارم» (مثلاً مرجوعی، وقتی فروشنده سیاستش را وارد
  // نکرده) هم یک بار دیگر با دکمه می‌پرسیم؛ شاید منظور واقعی مشتری موضوع
  // دیگری بوده. ارجاع فقط بعد از چند بار تلاش انجام می‌شود.
  // «نفهمیدم» ولی کاتالوگ چیز نزدیکی دارد: به‌جای سؤال مبهم، همان نامزدها را
  // با دکمه نشان می‌دهیم. قبلاً جمله‌ای مثل «کفش مردانه دارید؟» به «مطمئن نشدم»
  // می‌رسید در حالی که محصول درست در کاتالوگ بود و مشتری باید خودش پیدایش می‌کرد.
  // شمارنده‌ی «نفهمیدم» همچنان جلو می‌رود (reason با unclear شروع می‌شود) تا اگر
  // چند بار پشت‌سرهم بی‌نتیجه بود، در نهایت به فروشنده ارجاع شود.
  const near = suggest(text, products);
  if (near.length) {
    const list = clarifyProducts(near, text, options.page ?? 0);
    return { ...list, reason: `unclear_${round + 1}_near` };
  }

  if (round >= MAX_CLARIFY_ROUNDS) {
    return handoffReply(shop, intents.length ? `no_data_${intents.join('_')}` : `unclear_${round + 1}`);
  }
  return askClarify(shop, products, round);
}
