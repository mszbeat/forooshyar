import type { CatalogProduct } from '../catalog/discovery';
import { normalizePersian } from '../fresh/fresh';
import type { AiService } from './ai.service';

/**
 * «فهمیدن» پیام مشتری با مدل زبانی.
 *
 * چرا جدا از `answerWithAi`: آن یکی **پاسخ** می‌سازد؛ این یکی فقط **نیت** را
 * روشن می‌کند. وقتی قاعده‌ها «محصولی با این عنوان نیست» می‌گویند، دو حالت
 * کاملاً متفاوت پشت یک پیام است:
 *
 *   ۱. مشتری نام محصولی را گفته که در کاتالوگ نیست → باید صریح گفته شود.
 *   ۲. مشتری همان محصول را با واژه‌ی دیگری گفته («کفش هاتون» = «کفش لوفر
 *      چرم») → باید همان محصول نشان داده شود، نه «پیدا نشد».
 *
 * قاعده‌ی محور نمی‌تواند این دو را از هم جدا کند چون هر دو یک پوشش واژگانی
 * ضعیف دارند. مدل با دیدن **عنوان‌های واقعی کاتالوگ** می‌تواند بگوید منظور
 * مشتری کدام است — ولی فقط از میان همان عنوان‌ها انتخاب می‌کند؛ هیچ محصول
 * تازه‌ای نمی‌سازد و هیچ عددی تولید نمی‌کند (خروجی JSON است، نه متن آزاد).
 */

export type Interpretation = {
  /** محصول: درباره‌ی کالا می‌پرسد؛ سؤال: موضوع فروشگاهی؛ سفارش: قصد خرید. */
  intent: 'product' | 'question' | 'order';
  /** عنوان دقیق محصول از فهرست داده‌شده (خالی = مطمئن نیست). */
  match: string;
  /** واژه‌های کلیدی برای جست‌وجوی دوباره در کاتالوگ. */
  keywords: string;
  /** آیا پاسخ دادن با مدل (با واقعیت‌های فروشگاه) لازم است؟ */
  needsAnswer: boolean;
};

export type InterpretResult =
  | { ok: true; data: Interpretation }
  | { ok: false; reason: string };

const EMPTY: Interpretation = { intent: 'product', match: '', keywords: '', needsAnswer: false };

function systemPrompt(shopName: string): string {
  return [
    `تو فقط «تحلیل‌گر نیت» دستیار فروشگاه «${shopName}» هستی.`,
    'کار تو این نیست که به مشتری جواب بدهی؛ فقط باید بفهمی مشتری چه می‌خواهد و خروجی JSON بدهی.',
    '',
    'فهرست محصولات موجود در پیام کاربر آمده است. قواعد سخت:',
    '۱) اگر مشتری درباره‌ی محصولی می‌پرسد که در فهرست هست، عیناً همان عنوان را در «match» بنویس (کپی حرف‌به‌حرف).',
    '۲) اگر محصولش در فهرست نیست، «match» را خالی بگذار و در «keywords» واژه‌های فارسی جست‌وجو را بنویس (مثلاً «کفش مردانه»).',
    '۳) اگر پیام درباره‌ی محصول نیست (ارسال، پرداخت، ساعت کاری، مرجوعی، احوال‌پرسی) → «intent» را question بگذار.',
    '۴) اگر قصد خرید دارد → «intent» را order بگذار.',
    '۵) «needsAnswer» را true بگذار اگر پاسخدادن به این پیام از تنظیمات فروشگاه یا کاتالوگ ممکن است.',
    '۶) هیچ‌وقت عدد، قیمت یا موجودی ننویس. فقط JSON.',
    '',
    'قالب دقیق خروجی (فقط همین، بدون توضیح):',
    '{"intent":"product|question|order","match":"","keywords":"","needsAnswer":true}',
  ].join('\n');
}

function userPrompt(text: string, products: CatalogProduct[]): string {
  // فقط عنوان‌ها: ارزان و کوتاه. قیمت و موجودی برای تشخیص نیت لازم نیست.
  const titles = products.slice(0, 400).map(product => `- ${product.title}`).join('\n');
  return [
    '## محصولات فروشگاه',
    titles || '- (کاتالوگ خالی است)',
    '',
    '## پیام مشتری',
    text,
  ].join('\n');
}

/** استخراج اولین شیء JSON از پاسخ مدل (مدل ممکن است ```json بگذارد). */
function parseJson(raw: string): unknown | null {
  const cleaned = raw.replace(/```json|```/gi, ' ').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try { return JSON.parse(cleaned.slice(start, end + 1)); } catch { return null; }
}

export async function interpretWithAi(
  ai: AiService,
  shop: { name: string },
  products: CatalogProduct[],
  text: string,
): Promise<InterpretResult> {
  if (!ai.enabled) return { ok: false, reason: 'ai_disabled' };

  const raw = await ai.complete(systemPrompt(shop.name), userPrompt(text, products), undefined, { temperature: 0, maxTokens: 200 });
  if (!raw) return { ok: false, reason: 'no_answer' };

  const parsed = parseJson(raw);
  if (!parsed || typeof parsed !== 'object') return { ok: false, reason: 'bad_json' };
  const body = parsed as Record<string, unknown>;

  const intent = body.intent === 'question' || body.intent === 'order' ? body.intent : 'product';
  const rawMatch = typeof body.match === 'string' ? normalizePersian(body.match).trim() : '';
  // مدل فقط می‌تواند از میان عنوان‌های واقعی انتخاب کند؛ عنوان ساختگی دور انداخته می‌شود.
  const match = rawMatch
    ? products.find(product => normalizePersian(product.title).trim() === rawMatch)?.title
      ?? products.find(product => normalizePersian(product.title).includes(rawMatch) || rawMatch.includes(normalizePersian(product.title)))?.title
      ?? ''
    : '';
  const keywords = typeof body.keywords === 'string' ? body.keywords.trim().slice(0, 120) : '';

  return {
    ok: true,
    data: {
      ...EMPTY,
      intent,
      match,
      keywords,
      needsAnswer: body.needsAnswer !== false,
    },
  };
}
