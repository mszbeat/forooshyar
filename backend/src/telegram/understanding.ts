/**
 * فهم «منظور» پیام فارسی — نه تطبیق کلمه‌به‌کلمه.
 *
 * چرا این فایل اضافه شد: قبلاً «ساعت کاری» جواب می‌گرفت ولی «تایم کاری» به
 * فروشنده ارجاع داده می‌شد. کاربر دو جمله با یک معنی می‌فرستاد و دو رفتار
 * کاملاً متفاوت می‌گرفت. اینجا هر مفهوم (قیمت، موجودی، ارسال، پرداخت، ساعت
 * کاری، مرجوعی، تخفیف…) یک مجموعه‌ی واژه دارد — با شکل‌های محاوره‌ای، عربی،
 * نیم‌فاصله و پسوندهای اضافه — و پیام با **ریشه‌ی** کلمه‌ها سنجیده می‌شود.
 *
 * اصل کار: هیچ حدسی زده نمی‌شود؛ اگر مفهوم تشخیص داده نشد، بات سؤال روشن‌کننده
 * می‌پرسد (با دکمه) تا منظور مشتری معلوم شود، نه اینکه فوری ارجاع بدهد.
 */
import { normalizePersian } from '../fresh/fresh';

export type IntentId =
  | 'price' | 'stock' | 'size' | 'shipping' | 'payment' | 'hours'
  | 'returns' | 'discount' | 'order' | 'greeting' | 'thanks'
  | 'human' | 'complaint';

export type IntentHit = { id: IntentId; score: number };

/**
 * پسوندهای پرتکرار فارسی که معنی کلمه را عوض نمی‌کنند.
 *
 * عمداً «ریشه‌یابی» نمی‌کنیم (بریدن حرف آخر): «کارت» به «کار» می‌رسید و جمله‌ی
 * «ساعت کاری» با «کارت به کارت» قاطی می‌شد. به‌جایش برای هر واژه‌ی واژه‌نامه،
 * شکل‌های صرفی‌اش را می‌سازیم و تطبیق **دقیق** می‌زنیم.
 */
const AFFIXES = [
  '', 'ش', 'م', 'ت', 'ی', 'یی', 'ه', 'ها', 'های', 'هام', 'هات', 'هاش', 'هامون', 'هاتون', 'هاشون',
  'مون', 'تون', 'شون', 'مان', 'تان', 'شان', 'یم', 'یمو', 'یتو', 'ید', 'ین', 'رو', 'را', 'و', 'هم',
];

/** همه‌ی شکل‌های یک واژه/عبارت: «ساعت کاری» → «ساعت کاریتون»، «قیمت» → «قیمتش» … */
function forms(phrase: string): string[] {
  const words = normalizePersian(phrase).split(' ').filter(Boolean);
  if (words.length === 0) return [];
  const head = words.slice(0, -1);
  const last = words[words.length - 1];
  return AFFIXES.map(affix => [...head, `${last}${affix}`].join(' '));
}

/** واژه‌های محاوره‌ای که پیش از ریشه‌یابی به معادل رسمی تبدیل می‌شوند. */
const SPOKEN: Record<string, string> = {
  تایم: 'ساعت', تایمش: 'ساعت', تایما: 'ساعت',
  چن: 'چند', چقد: 'چقدر', چقده: 'چقدر', چنده: 'قیمت', چندست: 'قیمت',
  تومن: 'تومان', تومنی: 'تومان',
  پستکرد: 'ارسال', میفرستید: 'ارسال', میفرستین: 'ارسال', بفرستید: 'ارسال',
  کارتتون: 'پرداخت', پرداختم: 'پرداخت',
  ادمین: 'مدیر', اپراتور: 'پشتیبان', کارشناس: 'پشتیبان',
  مرجوعی: 'مرجوع', برگردونم: 'برگرداندن', پسش: 'مرجوع',
  سایزش: 'سایز', سایزاش: 'سایز', سایزهایی: 'سایز', سایزها: 'سایز', اندازش: 'اندازه',
};

/** تبدیل متن مشتری به شکل قابل مقایسه: نرمال‌سازی + معادل‌های محاوره‌ای. */
export function analyze(text: string): { text: string; words: string[] } {
  const normalized = normalizePersian(text);
  const words = normalized.split(' ').filter(Boolean).map(word => SPOKEN[word] ?? word);
  return { text: ` ${words.join(' ')} `, words };
}

type Concept = {
  id: IntentId;
  /** عبارت چندکلمه‌ای (وزن ۳) — قبل از واژه‌ی تک‌کلمه سنجیده می‌شود. */
  phrases?: string[];
  /** واژه‌های تک‌کلمه‌ای (وزن ۱). */
  words?: string[];
};

/**
 * واژه‌نامه. هر چه جمله‌ی مشتری به این‌ها نزدیک‌تر باشد، پاسخ دقیق‌تر می‌شود.
 * عمداً سخاوتمندانه نوشته شده: کاربر عامیانه، کوتاه یا با غلط تایپی می‌نویسد.
 */
const CONCEPTS: Concept[] = [
  {
    id: 'price',
    phrases: ['چند تومن', 'چند تومان', 'چند میشه', 'چند میدین', 'چند میدید', 'چند میگیرید', 'قیمت داره', 'قیمت اش', 'هزینه اش', 'هزینه ش', 'به چه قیمت', 'قیمت خورده'],
    words: ['قیمت', 'چنده', 'چقدر', 'چقدره', 'هزینه', 'نرخ', 'تعرفه', 'تومان', 'گرون', 'ارزان', 'چند'],
  },
  {
    id: 'stock',
    phrases: ['موجود دارید', 'موجود دارین', 'موجود هست', 'موجود میشه', 'باقی مونده', 'چند تا مونده', 'تموم شده', 'تمام شده', 'کی میرسه', 'هنوز هست', 'هنوز داره', 'هنوز دارید'],
    words: ['موجود', 'موجودی', 'موجوده', 'ناموجود', 'مانده', 'هست', 'دارید', 'دارین', 'داره'],
  },
  {
    id: 'size',
    phrases: ['راهنمای سایز', 'چه سایزی', 'چه سایز', 'سایز بندی', 'رنگ بندی', 'چه رنگ', 'کیفیت پارچه'],
    words: ['سایز', 'اندازه', 'رنگ', 'قد', 'دور'],
  },
  {
    id: 'shipping',
    phrases: ['چند روزه', 'چند روز', 'هزینه ارسال', 'پست پیشتاز', 'کی به دستم', 'دستم میرسه', 'کی میرسه', 'ارسال به', 'تیپاکس', 'باربری', 'پست میکنید'],
    words: ['ارسال', 'پست', 'پیک', 'تحویل', 'کرایه', 'مرسوله', 'پیگیری'],
  },
  {
    id: 'payment',
    phrases: ['کارت به کارت', 'درگاه پرداخت', 'پرداخت آنلاین', 'پرداخت در محل', 'پرداخت هنگام', 'قسطی', 'علی الحساب'],
    words: ['پرداخت', 'پرداختی', 'درگاه', 'آنلاین', 'قسط', 'اعتباری', 'واریز', 'شبا', 'کارت', 'فیش'],
  },
  {
    id: 'hours',
    phrases: ['ساعت کاری', 'ساعت کار', 'ساعات کاری', 'وقت کاری', 'چه ساعتی', 'تا کی باز', 'کی باز', 'کی بسته', 'ساعت پاسخگویی', 'ساعت پشتیبانی', 'تایم کاری'],
    words: ['ساعت', 'شیفت', 'تعطیل'],
  },
  {
    id: 'returns',
    phrases: ['پس بدم', 'پس بده', 'پولمو پس', 'برگشت بزنم', 'تعویض کنم', 'مرجوع کنم', 'لغو سفارش', 'کنسل کنم'],
    words: ['مرجوع', 'مرجوعی', 'برگرداندن', 'برگشت', 'تعویض', 'عودت', 'کنسل', 'انصراف', 'استرداد'],
  },
  {
    id: 'discount',
    phrases: ['کد تخفیف', 'تخفیف دارید', 'تخفیف دارین', 'ارزون تر', 'ارزان تر', 'حراج دارید'],
    words: ['تخفیف', 'حراج', 'کوپن', 'جشنواره'],
  },
  {
    id: 'order',
    phrases: ['ثبت سفارش', 'سفارش بدم', 'میخوام بخرم', 'میخوام سفارش', 'چطور بخرم', 'چطوری بخرم', 'خرید کنم', 'سبد خرید'],
    words: ['سفارش', 'خرید', 'بخرم'],
  },
  {
    id: 'greeting',
    phrases: ['سلام وقت بخیر', 'وقت بخیر', 'صبح بخیر', 'ظهر بخیر', 'شب بخیر', 'خسته نباشید', 'خسته نباشی'],
    words: ['سلام', 'درود', 'سلامم'],
  },
  {
    id: 'thanks',
    phrases: ['دستت درد نکنه', 'لطف کردی', 'ممنونم ازت', 'مرسی ازت', 'خدا حافظ', 'خداحافظ'],
    words: ['ممنون', 'مرسی', 'سپاس', 'متشکر', 'لطف'],
  },
  {
    id: 'human',
    phrases: ['با یه آدم', 'با یک انسان', 'آدم واقعی', 'با مدیر', 'با فروشنده', 'با پشتیبان', 'با کارشناس', 'وصل کن'],
    words: ['انسان', 'مدیر', 'پشتیبان', 'کارشناس', 'اوپراتور', 'فروشنده'],
  },
  {
    id: 'complaint',
    phrases: ['پولمو پس بدید', 'پولمو پس بدین', 'شکایت دارم', 'خیلی بد', 'پشیمون شدم', 'عصبانی ام'],
    words: ['شکایت', 'کلاهبردار', 'افتضاح', 'عصبانی', 'ناراحت', 'دروغ', 'تقلب', 'خراب', 'معیوب', 'آسیب', 'بی ادب'],
  },
];

/** واژه‌هایی که به‌تنهایی معنی موضوع را نمی‌سازند. */
const WEAK_WORDS = ['چند', 'دارید', 'دارین', 'داره', 'دارد', 'هست', 'هستش'];

/** عبارت/واژه‌های آماده‌شده برای تطبیق (یک‌بار محاسبه می‌شوند). */
const PREPARED = CONCEPTS.map(concept => ({
  id: concept.id,
  phrases: (concept.phrases ?? []).map(phrase => ({ phrase: ` ${normalizePersian(phrase)} `, multi: phrase.trim().includes(' ') })),
  forms: (concept.words ?? []).flatMap(word => forms(word)).map(form => ` ${form} `),
}));

/**
 * رتبه‌بندی مفهوم‌های موجود در یک پیام.
 *
 * - بهترین عبارت چندکلمه‌ای ۳ امتیاز، واژه‌های تک‌کلمه‌ای هر یک ۱ امتیاز (سقف ۲).
 * - «چند» تنها، نیم امتیاز دارد تا جمله‌ی «چند روزه می‌رسه» به‌جای قیمت،
 *   ارسال فهمیده شود.
 */
export function detectIntents(text: string): IntentHit[] {
  const { text: normalized } = analyze(text);
  if (!normalized.trim()) return [];
  const hits: IntentHit[] = [];

  for (const concept of PREPARED) {
    let phraseScore = 0;
    for (const item of concept.phrases) {
      const base = item.phrase;
      const matched = normalized.includes(base)
        || AFFIXES.some(affix => affix && normalized.includes(`${base.trimEnd()}${affix} `));
      if (matched) phraseScore = Math.max(phraseScore, item.multi ? 3 : 2);
    }
    let wordScore = 0;
    for (const form of concept.forms) {
      if (!normalized.includes(form)) continue;
      // «دارید/هست/چند» به‌تنهایی موضوع را مشخص نمی‌کنند: «مرجوعی دارید؟» درباره‌ی
      // موجودی نیست، درباره‌ی مرجوعی است. وزن نیم می‌گیرند.
      wordScore += WEAK_WORDS.some(weak => form.includes(` ${weak} `)) ? 0.5 : 1;
    }
    const score = phraseScore + Math.min(wordScore, 2);
    if (score > 0) hits.push({ id: concept.id, score });
  }

  return hits.sort((a, b) => b.score - a.score);
}

/** آیا پیام به محصول مربوط است؟ (قیمت/موجودی/سایز) */
export function wantsProduct(hits: IntentHit[]): boolean {
  return hits.some(hit => hit.id === 'price' || hit.id === 'stock' || hit.id === 'size');
}

/** آیا باید بدون سؤال به انسان وصل شود؟ (شکایت/درخواست صریح انسان) */
export function needsHuman(hits: IntentHit[]): boolean {
  return hits.some(hit => hit.id === 'human' || hit.id === 'complaint');
}

/**
 * دکمه‌های سؤال روشن‌کننده.
 *
 * به‌جای «به فروشنده ارجاع شد»، به مشتری گزینه‌های واقعی همان فروشگاه را
 * نشان می‌دهیم تا با یک لمس منظورش را بگوید.
 */
export type ClarifyOption = { id: IntentId; label: string };

export function clarifyOptions(available: { shipping: boolean; payment: boolean; hours: boolean; returns: boolean; products: boolean }): ClarifyOption[] {
  const options: ClarifyOption[] = [];
  if (available.products) options.push({ id: 'price', label: '💰 قیمت و موجودی' });
  if (available.products) options.push({ id: 'size', label: '📏 سایز و رنگ' });
  if (available.shipping) options.push({ id: 'shipping', label: '🚚 ارسال و تحویل' });
  if (available.payment) options.push({ id: 'payment', label: '💳 پرداخت' });
  if (available.hours) options.push({ id: 'hours', label: '🕒 ساعت کاری' });
  if (available.returns) options.push({ id: 'returns', label: '↩️ مرجوعی و تعویض' });
  if (available.products) options.push({ id: 'order', label: '🛒 ثبت سفارش' });
  return options;
}

/**
 * چند پیام نامفهوم پشت‌سرهم یعنی «بات نمی‌فهمد» → ارجاع به انسان.
 * با ۳ بار سؤال روشن‌کننده، مشتری سه فرصت داشته منظورش را بگوید.
 */
export const MAX_CLARIFY_ROUNDS = 3;

/** برچسب فارسی مفهوم‌ها برای پیام فروشنده و لاگ. */
export const INTENT_LABELS: Record<IntentId, string> = {
  price: 'قیمت', stock: 'موجودی', size: 'سایز و رنگ', shipping: 'ارسال',
  payment: 'پرداخت', hours: 'ساعت کاری', returns: 'مرجوعی', discount: 'تخفیف',
  order: 'سفارش', greeting: 'سلام', thanks: 'تشکر', human: 'درخواست انسان',
  complaint: 'شکایت',
};
