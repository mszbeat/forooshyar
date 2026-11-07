import { findCity, findProvince, PROVINCES, type Province } from '../geo/iran-geo';
import type { BotButton, BotReply } from './brain';

/**
 * سفارش‌گیری گام‌به‌گام در تلگرام.
 *
 * چرا حالت ذخیره می‌شود: webhook بی‌حالت است و هر پیام یک درخواست جدا. draft در
 * `TelegramConversation.draft` می‌نشیند، پس اگر سرور ری‌استارت شود یا Render بعد
 * از ۱۵ دقیقه بیدار شود، مشتری از همان مرحله ادامه می‌دهد.
 *
 * این فایل «خالص» است: هیچ دیتابیسی و هیچ تلگرامی صدا زده نمی‌شود. فقط
 * ورودی → حالت بعدی + متنی که باید فرستاده شود.
 *
 * نشانی عمداً ساخت‌یافته است: استان و شهر از لیست انتخاب می‌شوند (تایپ آزاد
 * منبع خطاست)، و خیابان/کوچه/پلاک/واحد جدا پرسیده می‌شوند تا پست بتواند بخواند.
 */

export type OrderStep =
  | 'quantity'
  | 'name'
  | 'phone'
  | 'province'
  | 'city'
  | 'street'
  | 'alley'
  | 'plaque'
  | 'unit'
  | 'postal'
  | 'confirm'
  | 'paying';

/** ترتیب مراحل؛ برای نوار پیشرفت و دکمه‌ی «بازگشت». */
export const STEP_ORDER: OrderStep[] = [
  'quantity', 'name', 'phone', 'province', 'city', 'street', 'alley', 'plaque', 'unit', 'postal', 'confirm', 'paying',
];

const STEP_TITLE: Record<OrderStep, string> = {
  quantity: 'تعداد',
  name: 'نام گیرنده',
  phone: 'موبایل',
  province: 'استان',
  city: 'شهر',
  street: 'خیابان',
  alley: 'کوچه',
  plaque: 'پلاک',
  unit: 'واحد',
  postal: 'کد پستی',
  confirm: 'تأیید',
  paying: 'پرداخت',
};

export type OrderDraft = {
  step: OrderStep;
  productId: string;
  variantId: string;
  title: string;
  spec: string;
  price: number;
  stock: number;
  quantity?: number;
  name?: string;
  phone?: string;
  province?: string;
  city?: string;
  street?: string;
  alley?: string;
  plaque?: string;
  unit?: string;
  postalCode?: string;
  /** صفحه‌ی فعلی لیست استان/شهر؛ در draft می‌ماند تا «بعدی» کار کند. */
  page?: number;
  updatedAt: string;
};

export type FlowOutcome =
  | { kind: 'prompt'; draft: OrderDraft; reply: BotReply }
  | { kind: 'ready'; draft: OrderDraft; reply: BotReply }
  | { kind: 'cancel'; reply: BotReply }
  | { kind: 'invalid'; draft: OrderDraft; reply: BotReply };

/** سقف تعداد در یک سفارش تلگرامی؛ جلوگیری از سفارش تایپی اشتباه. */
export const MAX_QUANTITY = 10;
/** در هر صفحه چند استان/شهر نشان داده شود. */
export const PAGE_SIZE = 10;

const toman = (value: number) => `${value.toLocaleString('fa-IR')} تومان`;
const fa = (value: number) => value.toLocaleString('fa-IR');

/** ارقام فارسی/عربی → لاتین، و یکدست‌کردن جداکننده‌ها. */
export function toLatinDigits(input: string): string {
  return input
    .replace(/[۰-۹]/g, char => String(char.charCodeAt(0) - 1776))
    .replace(/[٠-٩]/g, char => String(char.charCodeAt(0) - 1632))
    .replace(/\s+/g, '');
}

/** موبایل ایرانی: ۰۹۱۲۳۴۵۶۷۸۹ / +98912… / 0098912… */
export function normalizePhone(input: string): string | null {
  let digits = toLatinDigits(input).replace(/[()-]/g, '');
  if (digits.startsWith('+98')) digits = `0${digits.slice(3)}`;
  else if (digits.startsWith('0098')) digits = `0${digits.slice(4)}`;
  else if (digits.startsWith('98') && digits.length === 12) digits = `0${digits.slice(2)}`;
  else if (digits.startsWith('9') && digits.length === 10) digits = `0${digits}`;
  return /^09\d{9}$/.test(digits) ? digits : null;
}

/** کد پستی ایران ۱۰ رقم است و با صفر شروع نمی‌شود؛ خالی هم مجاز است. */
export function normalizePostalCode(input: string): string | null {
  const digits = toLatinDigits(input).replace(/[^\d]/g, '');
  if (digits.length !== 10 || digits.startsWith('0')) return null;
  return digits;
}

export function startDraft(input: {
  productId: string;
  variantId: string;
  title: string;
  spec: string;
  price: number;
  stock: number;
}): OrderDraft {
  return { ...input, step: 'quantity', page: 0, updatedAt: new Date().toISOString() };
}

export function draftTitle(draft: OrderDraft): string {
  return `${draft.title}${draft.spec ? ` (${draft.spec})` : ''}`;
}

/** «مرحله ۴ از ۱۱ · استان» */
export function progressLine(draft: OrderDraft): string {
  const index = STEP_ORDER.indexOf(draft.step);
  const total = STEP_ORDER.indexOf('confirm') + 1;
  if (index < 0 || index > STEP_ORDER.indexOf('confirm')) return '';
  const dots = STEP_ORDER.slice(0, total).map((step, position) => (position < index ? '●' : position === index ? '◉' : '○')).join('');
  return `<i>مرحله ${fa(index + 1)} از ${fa(total)} · ${STEP_TITLE[draft.step]}</i>\n${dots}\n`;
}

const backButton: BotButton = { text: '◀ بازگشت', data: 'flow:back' };
const cancelButton: BotButton = { text: '✖ لغو سفارش', data: 'flow:cancel' };

function navRow(extra?: BotButton[]): BotButton[] {
  return extra ? [backButton, ...extra, cancelButton] : [backButton, cancelButton];
}

function quantityButtons(draft: OrderDraft): BotButton[][] {
  const max = Math.min(draft.stock, MAX_QUANTITY);
  const quick = [1, 2, 3, 4, 5].filter(value => value <= max);
  const rows: BotButton[][] = [];
  for (let index = 0; index < quick.length; index += 3) {
    rows.push(quick.slice(index, index + 3).map(value => ({ text: `${fa(value)} عدد`, data: `flow:q:${value}` })));
  }
  rows.push([cancelButton]);
  return rows;
}

/** یک استان در هر ردیف: نام استان‌ها بلند است و دو تا در یک ردیف بریده می‌شد. */
function provinceButtons(page: number): { rows: BotButton[][]; pages: number } {
  const pages = Math.ceil(PROVINCES.length / PAGE_SIZE);
  const current = Math.min(Math.max(page, 0), pages - 1);
  const slice = PROVINCES.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);
  const rows: BotButton[][] = slice.map(province => [{ text: province.name, data: `flow:prov:${province.name}` }]);
  rows.push(pagerRow(current, pages, 'flow:provpage'));
  rows.push([cancelButton]);
  return { rows, pages };
}

function cityButtons(province: Province, page: number): { rows: BotButton[][]; pages: number } {
  const pages = Math.ceil(province.cities.length / PAGE_SIZE);
  const current = Math.min(Math.max(page, 0), pages - 1);
  const slice = province.cities.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);
  const rows: BotButton[][] = slice.map(city => [{ text: city, data: `flow:city:${city}` }]);
  if (pages > 1) rows.push(pagerRow(current, pages, 'flow:citypage'));
  rows.push([backButton, cancelButton]);
  return { rows, pages };
}

/** «قبلی / ۳ از ۵ / بعدی» — فقط وقتی بیش از یک صفحه هست. */
function pagerRow(current: number, pages: number, prefix: string): BotButton[] {
  if (pages <= 1) return [];
  const row: BotButton[] = [];
  if (current > 0) row.push({ text: '◀ قبلی', data: `${prefix}:${current - 1}` });
  row.push({ text: `${fa(current + 1)} از ${fa(pages)}`, data: 'flow:noop' });
  if (current < pages - 1) row.push({ text: 'بعدی ▶', data: `${prefix}:${current + 1}` });
  return row;
}

/** متن مرحله‌ی جاری. همه‌ی مقادیر کاربر با escape می‌آیند تا HTML تلگرام نشکند. */
export function promptFor(draft: OrderDraft, telegramName = ''): BotReply {
  const head = progressLine(draft);

  switch (draft.step) {
    case 'quantity':
      return {
        kind: 'order',
        text: [
          head,
          `<b>سفارش ${escapeHtml(draftTitle(draft))}</b>`,
          `${toman(draft.price)} · موجودی: ${fa(draft.stock)} عدد`,
          '',
          'چند عدد می‌خواهید؟ عدد را بفرستید یا یکی از دکمه‌ها را بزنید.',
        ].join('\n'),
        buttons: quantityButtons(draft),
      };
    case 'name':
      return {
        kind: 'order',
        text: `${head}<b>نام و نام خانوادگی گیرنده</b>\nهمان‌طور که روی مرسوله می‌نویسند.`,
        buttons: [telegramName
          ? [{ text: `همان «${telegramName.slice(0, 24)}» تلگرام`, data: 'flow:name:self' }]
          : [], navRow()].filter(row => row.length > 0),
        parseMode: 'HTML',
      };
    case 'phone':
      return {
        kind: 'order',
        text: `${head}<b>شماره‌ی موبایل</b>\nبرای هماهنگی پست و پیگیری سفارش.\n<pre>۰۹۱۲۳۴۵۶۷۸۹</pre>`,
        buttons: [navRow()],
        parseMode: 'HTML',
      };
    case 'province': {
      const { rows, pages } = provinceButtons(draft.page ?? 0);
      const current = Math.min(Math.max(draft.page ?? 0, 0), pages - 1);
      return {
        kind: 'order',
        text: [
          head,
          '<b>استان</b>',
          'استان را از لیست انتخاب کنید:',
          `<i>(صفحه ${fa(current + 1)} از ${fa(pages)})</i>`,
        ].join('\n'),
        buttons: rows,
        parseMode: 'HTML',
      };
    }
    case 'city': {
      const province = findProvince(draft.province ?? '');
      if (!province) {
        // نباید پیش بیاید، ولی اگر شد مشتری گیر نکند.
        const next = { ...draft, step: 'province' as const, province: undefined, page: 0 };
        return promptFor(next, telegramName);
      }
      const { rows } = cityButtons(province, draft.page ?? 0);
      return {
        kind: 'order',
        text: [
          head,
          `<b>شهر در استان ${escapeHtml(province.name)}</b>`,
          'شهر را انتخاب کنید، یا نامش را بنویسید:',
        ].join('\n'),
        buttons: rows,
        parseMode: 'HTML',
      };
    }
    case 'street':
      return {
        kind: 'order',
        text: `${head}<b>خیابان</b>\nنام خیابان یا بلوار اصلی را بنویسید.`,
        buttons: [navRow()],
        parseMode: 'HTML',
      };
    case 'alley':
      return {
        kind: 'order',
        text: `${head}<b>کوچه</b>\nنام کوچه را بنویسید. اگر ندارد «ندارد» را بزنید.`,
        buttons: [[{ text: 'کوچه ندارد', data: 'flow:alley:none' }], navRow()],
        parseMode: 'HTML',
      };
    case 'plaque':
      return {
        kind: 'order',
        text: `${head}<b>پلاک</b>\nشماره‌ی پلاک را بفرستید.`,
        buttons: [navRow()],
        parseMode: 'HTML',
      };
    case 'unit':
      return {
        kind: 'order',
        text: `${head}<b>واحد</b>\nشماره‌ی واحد یا طبقه را بفرستید (اختیاری).`,
        buttons: [[{ text: 'واحد ندارد', data: 'flow:unit:none' }], navRow()],
        parseMode: 'HTML',
      };
    case 'postal':
      return {
        kind: 'order',
        text: [
          head,
          '<b>کد پستی</b> <i>(اختیاری)</i>',
          'کد پستی ۱۰ رقمی را بفرستید یا «رد کردن» را بزنید.',
          '<i>با کد پستی، مرسوله دقیق‌تر و سریع‌تر می‌رسد.</i>',
        ].join('\n'),
        buttons: [[{ text: 'رد کردن کد پستی', data: 'flow:postal:skip' }], navRow()],
        parseMode: 'HTML',
      };
    case 'confirm':
      return {
        kind: 'order',
        text: [
          head,
          '<b>🧾 پیش‌فاکتور سفارش شما</b>',
          '',
          `🛍 ${escapeHtml(draftTitle(draft))}`,
          `🔢 ${fa(draft.quantity ?? 1)} عدد × ${toman(draft.price)} = <b>${toman(draft.price * (draft.quantity ?? 1))}</b>`,
          '',
          `👤 ${escapeHtml(draft.name ?? '—')}`,
          `📱 ${escapeHtml(draft.phone ?? '—')}`,
          `📍 ${escapeHtml(fullAddress(draft))}`,
          draft.postalCode ? `📮 کد پستی: ${escapeHtml(draft.postalCode)}` : '📮 کد پستی: ندارد',
          '',
          'اطلاعات درست است؟ با تأیید، لینک پرداخت برایتان می‌آید.',
        ].join('\n'),
        buttons: [
          [{ text: '✅ تأیید و دریافت لینک پرداخت', data: 'flow:confirm' }],
          [backButton, cancelButton],
        ],
        parseMode: 'HTML',
      };
    case 'paying':
      return {
        kind: 'order',
        text: 'منتظر پرداخت هستم. اگر لینک را گم کردید /orders یا /help را بزنید.',
        buttons: [[cancelButton]],
      };
    default:
      return { kind: 'order', text: 'ادامه بدهید.' };
  }
}

/**
 * نشانی یک‌خطی برای پیام‌ها، پنل و خروجی.
 * اگر مشتری خودش «کوچه بهار» نوشته باشد، «کوچه کوچه بهار» نمی‌سازیم.
 */
export function fullAddress(draft: Pick<OrderDraft, 'province' | 'city' | 'street' | 'alley' | 'plaque' | 'unit'>): string {
  const strip = (value: string, words: string[]) => {
    let result = value.trim();
    for (const word of words) {
      if (result.startsWith(`${word} `)) result = result.slice(word.length + 1).trim();
    }
    return result;
  };
  const street = draft.street ? strip(draft.street, ['خیابان', 'بلوار', 'خیابان']) : '';
  const alley = draft.alley && draft.alley !== 'ندارد' ? strip(draft.alley, ['کوچه']) : '';
  const parts = [
    [draft.province, draft.city].filter(Boolean).join('، '),
    street ? `خیابان ${street}` : '',
    alley ? `کوچه ${alley}` : '',
    draft.plaque ? `پلاک ${draft.plaque}` : '',
    draft.unit && draft.unit !== 'ندارد' ? `واحد ${draft.unit}` : '',
  ].filter(Boolean);
  return parts.join('، ');
}

export function escapeHtml(input: string): string {
  return input.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** مرحله‌ی قبل؛ برای دکمه‌ی بازگشت. */
export function previousStep(step: OrderStep): OrderStep {
  const index = STEP_ORDER.indexOf(step);
  return index > 0 ? STEP_ORDER[index - 1] : 'quantity';
}

/**
 * مرحله‌ی بعد بر اساس ورودی مشتری (متن یا دکمه).
 * هر خطای ورودی، همان مرحله را با پیام روشن تکرار می‌کند؛ هیچ‌وقت مشتری از
 * جریان بیرون نمی‌افتد مگر خودش لغو کند.
 */
export function applyInput(
  draft: OrderDraft,
  input: { text?: string; data?: string; telegramName?: string },
): FlowOutcome {
  const text = (input.text ?? '').trim();
  const data = input.data ?? '';
  const next = (patch: Partial<OrderDraft>, step: OrderStep): FlowOutcome => {
    const updated: OrderDraft = { ...draft, ...patch, step, page: 0, updatedAt: new Date().toISOString() };
    return { kind: 'prompt', draft: updated, reply: promptFor(updated, input.telegramName) };
  };
  const retry = (message: string): FlowOutcome => {
    const prompt = promptFor(draft, input.telegramName);
    return { kind: 'invalid', draft, reply: { ...prompt, text: `⚠️ ${message}\n\n${prompt.text}` } };
  };

  if (data === 'flow:cancel' || /^(لغو|انصراف|بیخیال|بی‌خیال)$/u.test(text)) {
    return { kind: 'cancel', reply: { kind: 'order', text: '✖ سفارش لغو شد. هر وقت خواستید دوباره شروع کنیم.' } };
  }
  if (data === 'flow:noop') {
    return { kind: 'invalid', draft, reply: promptFor(draft, input.telegramName) };
  }
  if (data === 'flow:back') {
    const step = previousStep(draft.step);
    const cleared: Partial<OrderDraft> = {};
    // مقدار همان مرحله را پاک می‌کنیم تا دوباره پرسیده و بازنویسی شود.
    // مقداری که می‌خواهیم دوباره بپرسیم، همان مرحله‌ای است که به آن برمی‌گردیم.
    const field: Partial<Record<OrderStep, keyof OrderDraft>> = {
      quantity: 'quantity', name: 'name', phone: 'phone', province: 'province',
      city: 'city', street: 'street', alley: 'alley', plaque: 'plaque', unit: 'unit', postal: 'postalCode',
    };
    const target = field[step];
    if (target) (cleared as Record<string, unknown>)[target] = undefined;
    // از شهر که برمی‌گردیم به استان، انتخاب قبلی شهر هم بی‌معنا می‌شود.
    if (step === 'province') cleared.city = undefined;
    const updated: OrderDraft = { ...draft, ...cleared, step, page: 0, updatedAt: new Date().toISOString() };
    return { kind: 'prompt', draft: updated, reply: promptFor(updated, input.telegramName) };
  }

  // ------------------------------------------------------------ دکمه‌های استان/شهر
  if (data.startsWith('flow:provpage:') || data.startsWith('flow:citypage:')) {
    const [, , raw] = data.split(':');
    const page = Number(raw);
    const updated: OrderDraft = { ...draft, page: Number.isInteger(page) ? page : 0, updatedAt: new Date().toISOString() };
    return { kind: 'prompt', draft: updated, reply: promptFor(updated, input.telegramName) };
  }

  if (draft.step === 'province') {
    const chosen = data.startsWith('flow:prov:') ? data.slice('flow:prov:'.length) : text;
    const province = findProvince(chosen);
    if (!province) {
      // اگر استان را تایپ کرده و پیدا نشد، پیشنهاد لیست می‌دهیم (نه خطای خشک).
      return retry('این استان در لیست نیست. یکی از دکمه‌ها را بزنید.');
    }
    return next({ province: province.name, city: undefined }, 'city');
  }

  if (draft.step === 'city') {
    const province = findProvince(draft.province ?? '');
    if (!province) return next({ province: undefined }, 'province');
    const chosen = data.startsWith('flow:city:') ? data.slice('flow:city:'.length) : text;
    const city = findCity(province.name, chosen);
    if (!city) {
      return retry(`«${escapeHtml(chosen.slice(0, 30))}» در استان ${escapeHtml(province.name)} پیدا نشد. از دکمه‌ها انتخاب کنید یا نام دقیق شهر را بنویسید.`);
    }
    return next({ city }, 'street');
  }

  // ------------------------------------------------------------ مراحل متنی
  if (draft.step === 'quantity') {
    const raw = data.startsWith('flow:q:') ? data.slice('flow:q:'.length) : text;
    const quantity = Number(toLatinDigits(raw).replace(/[^\d]/g, ''));
    if (!Number.isInteger(quantity) || quantity < 1) return retry('تعداد معتبر نیست. یک عدد بفرستید.');
    if (quantity > Math.min(draft.stock, MAX_QUANTITY)) {
      return retry(`حداکثر ${fa(Math.min(draft.stock, MAX_QUANTITY))} عدد می‌توانید سفارش دهید.`);
    }
    return next({ quantity }, 'name');
  }

  if (draft.step === 'name') {
    if (data === 'flow:name:self') {
      const name = (input.telegramName ?? '').trim();
      if (!name) return retry('نام تلگرام شما در دسترس نیست؛ نام گیرنده را بنویسید.');
      return next({ name: name.slice(0, 80) }, 'phone');
    }
    if (text.length < 3) return retry('نام را کامل بنویسید.');
    return next({ name: text.slice(0, 80) }, 'phone');
  }

  if (draft.step === 'phone') {
    const phone = normalizePhone(text);
    if (!phone) return retry('شماره معتبر نیست. موبایل ۱۱ رقمی بفرستید (۰۹…).');
    return next({ phone }, 'province');
  }

  if (draft.step === 'street') {
    if (text.length < 3) return retry('نام خیابان را کامل بنویسید.');
    return next({ street: text.slice(0, 120) }, 'alley');
  }

  if (draft.step === 'alley') {
    if (data === 'flow:alley:none') return next({ alley: 'ندارد' }, 'plaque');
    if (text.length < 2) return retry('نام کوچه را بنویسید یا «کوچه ندارد» را بزنید.');
    return next({ alley: text.slice(0, 120) }, 'plaque');
  }

  if (draft.step === 'plaque') {
    const plaque = toLatinDigits(text).replace(/[^\d۰-۹]/g, '');
    if (!plaque) return retry('شماره‌ی پلاک را بفرستید (رقم).');
    return next({ plaque: plaque.slice(0, 10) }, 'unit');
  }

  if (draft.step === 'unit') {
    if (data === 'flow:unit:none' || /^(ندارد|نداره|نیست)$/u.test(text)) return next({ unit: 'ندارد' }, 'postal');
    if (text.length < 1) return retry('شماره‌ی واحد را بفرستید یا «واحد ندارد» را بزنید.');
    // ارقام فارسی به لاتین تا برچسب پست یکدست باشد.
    return next({ unit: toLatinDigits(text).slice(0, 20) }, 'postal');
  }

  if (draft.step === 'postal') {
    if (data === 'flow:postal:skip' || /^(رد|رد کردن|ندارد|ندارم|skip)$/u.test(text)) return next({ postalCode: undefined }, 'confirm');
    const postal = normalizePostalCode(text);
    if (!postal) return retry('کد پستی باید ۱۰ رقم باشد و با صفر شروع نشود. می‌توانید «رد کردن» را بزنید.');
    return next({ postalCode: postal }, 'confirm');
  }

  if (draft.step === 'confirm') {
    if (data === 'flow:confirm' || /^(تأیید|تایید|بله|درسته|باشه|✅)$/u.test(text)) {
      return { kind: 'ready', draft, reply: { kind: 'order', text: 'در حال ساخت لینک پرداخت…' } };
    }
    return retry('برای ادامه دکمه‌ی «تأیید» را بزنید یا «لغو» بفرستید.');
  }

  return { kind: 'invalid', draft, reply: promptFor(draft, input.telegramName) };
}
