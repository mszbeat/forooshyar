export type FreshVariant = { price: number; stock: number; size: string; color: string };
export type FreshProduct = { title: string; variants: FreshVariant[] };
export type FreshShop = { id?: string; shipping: string; payment: string; workingHours: string; handoffMessage: string };
export type FreshResult = { kind: 'answer' | 'clarify' | 'handoff'; text: string };

export function normalizePersian(input: string): string {
  return input.normalize('NFKC').replace(/[يى]/g, 'ی').replace(/ك/g, 'ک')
    .replace(/[۰-۹٠-٩]/g, char => String(char.charCodeAt(0) - (char >= '۰' && char <= '۹' ? 1776 : 1632)))
    .replace(/[\u064b-\u065f\u0670\u0640]/g, '').replace(/[\u200c\u200d]/g, ' ')
    .toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}

// This intentionally does not guess: no full title match or more than one
// match leads to a clarification/handoff. Customer messages are never commands.
export function answerFresh(message: string, shop: FreshShop, products: FreshProduct[]): FreshResult {
  const q = normalizePersian(message);
  const handoff = (): FreshResult => ({ kind: 'handoff', text: shop.handoffMessage.trim() || 'برای پاسخ دقیق‌تر با فروشنده هماهنگ می‌کنم.' });
  if (!q) return handoff();
  if (/(تخفیف|ارزانتر|ارزونتر|مرجوع|پس بدم|تعویض|شکایت|اعتراض|عصبانی|افتضاح|کلاهبردار|مدیر|پشتیبان|ادمین|انسان|دروغگو|بی ادب|لغو سفارش|کنسل|دستور|نادیده|ignore|system prompt)/u.test(q)) return handoff();
  const price = /(قیمت|چنده|چندهش|چند تومن|چند تومان|چقدر|هزینه اش|قیمتش)/u.test(q);
  const availability = /(موجود|دارید|دارین|داری|هست|تموم شده|موجوده)/u.test(q);
  const shipping = /(ارسال|پست|پیک|تحویل)/u.test(q);
  const payment = /(پرداخت|کارت به کارت|درگاه|پرداختی)/u.test(q);
  const hours = /(ساعت کاری|ساعت کار|چه ساعتی|کی باز|کی بسته)/u.test(q);
  const size = /(سایز|اندازه|رنگ)/u.test(q);
  const categories = [price || availability || size, shipping, payment, hours].filter(Boolean).length;
  if (categories > 1) return handoff();
  if (shipping) return shop.shipping.trim() ? { kind: 'answer', text: shop.shipping.trim() } : handoff();
  if (payment) return shop.payment.trim() ? { kind: 'answer', text: shop.payment.trim() } : handoff();
  if (hours) return shop.workingHours.trim() ? { kind: 'answer', text: shop.workingHours.trim() } : handoff();
  if (price || availability || size) {
    const matches = products.filter(product => {
      const title = normalizePersian(product.title);
      return title.length > 0 && (` ${q} `).includes(` ${title} `);
    });
    if (matches.length === 0) return handoff();
    if (matches.length > 1) return { kind: 'clarify', text: 'لطفاً نام دقیق محصول موردنظرتان را مشخص کنید.' };
    const product = matches[0];
    if (product.variants.length !== 1) return { kind: 'clarify', text: 'لطفاً سایز و رنگ دقیق محصول را مشخص کنید تا فروشنده بررسی کند.' };
    const variant = product.variants[0];
    // A request mentioning another size or color must not receive this variant's
    // price/stock. Never infer a match from a product title alone.
    const normalizedSize = normalizePersian(variant.size);
    const titleNumbers = new Set(normalizePersian(product.title).match(/\d+/g) ?? []);
    const requestedNumbers = (q.match(/\d+/g) ?? []).filter(number => !titleNumbers.has(number));
    if (requestedNumbers.some(number => !normalizedSize.split(' ').includes(number))) return handoff();
    const sizeRequest = q.match(/سایز\s+(?:های\s+|رو\s+|به\s+)?([\p{L}\p{N}]+)/u)?.[1];
    const ignoredSizeWords = new Set(['داره', 'دارید', 'دارین', 'موجوده', 'موجود', 'هست', 'چنده', 'قیمت', 'چی', 'چه']);
    if (sizeRequest && !ignoredSizeWords.has(sizeRequest) && !normalizedSize.split(' ').includes(sizeRequest)) return handoff();
    const colorRequest = q.match(/رنگ\s+(?:های\s+|رو\s+|به\s+)?([\p{L}\p{N}]+)/u)?.[1];
    const ignoredColorWords = new Set(['داره', 'دارید', 'دارین', 'موجوده', 'موجود', 'هست', 'چنده', 'قیمت', 'چی', 'چه']);
    if (colorRequest && !ignoredColorWords.has(colorRequest) && !normalizePersian(variant.color).split(' ').includes(colorRequest)) return handoff();
    const description = [variant.size ? `سایز ${variant.size}` : '', variant.color ? `رنگ ${variant.color}` : ''].filter(Boolean).join('، ');
    const prefix = `${product.title}${description ? ` (${description})` : ''}`;
    const pieces: string[] = [];
    if (price) pieces.push(`قیمت ${prefix}: ${variant.price.toLocaleString('fa-IR')} تومان است.`);
    if (availability) pieces.push(variant.stock > 0 ? `${prefix} طبق موجودی ثبت‌شده موجود است؛ برای نهایی‌کردن با فروشنده هماهنگ می‌کنم.` : `${prefix} طبق موجودی ثبت‌شده ناموجود است؛ برای اطمینان با فروشنده هماهنگ می‌کنم.`);
    if (size && !price && !availability) pieces.push(description ? `مشخصات ${product.title}: ${description}.` : 'مشخصات سایز و رنگ ثبت نشده است؛ با فروشنده هماهنگ می‌کنم.');
    return { kind: 'answer', text: pieces.join(' ') };
  }
  if (/^(سلام|درود|سلام وقت بخیر|سلام خسته نباشید)$/u.test(q)) return { kind: 'answer', text: 'سلام، خوش آمدید. چطور می‌توانم کمکتان کنم؟' };
  return handoff();
}
