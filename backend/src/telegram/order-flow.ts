import type { BotButton, BotReply } from './brain';

/**
 * سفارش‌گیری گام‌به‌گام در تلگرام.
 *
 * چرا حالت ذخیره می‌شود: webhook بی‌حالت است و هر پیام یک درخواست جدا. draft در
 * `TelegramConversation.draft` می‌نشیند، پس اگر سرور ری‌استارت شود یا Render بعد
 * از ۱۵ دقیقه بیدار شود، مشتری از همان مرحله ادامه می‌دهد.
 *
 * این فایل «خالص» است: هیچ دیتابیسی و هیچ تلگرامی صدا زده نمی‌شود. فقط
 * ورودی → حالت بعدی + متنی که باید فرستاده شود. تست‌کردنش همین را ساده می‌کند.
 */

export type OrderStep = 'quantity' | 'name' | 'phone' | 'address' | 'confirm' | 'paying';

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
  address?: string;
  /** شناسه‌ی سفارش پس از تأیید؛ تا از تأیید دوباره جلوگیری شود. */
  orderId?: string;
  updatedAt: string;
};

export type FlowOutcome =
  | { kind: 'prompt'; draft: OrderDraft; reply: BotReply }
  | { kind: 'ready'; draft: OrderDraft; reply: BotReply }
  | { kind: 'cancel'; reply: BotReply }
  | { kind: 'invalid'; draft: OrderDraft; reply: BotReply };

/** سقف تعداد در یک سفارش تلگرامی؛ جلوگیری از سفارش تایپی اشتباه. */
export const MAX_QUANTITY = 10;

const toman = (value: number) => `${value.toLocaleString('fa-IR')} تومان`;

function priceLine(draft: OrderDraft): string {
  const quantity = draft.quantity ?? 1;
  return `${quantity.toLocaleString('fa-IR')} × ${toman(draft.price)} = ${toman(draft.price * quantity)}`;
}

export function draftTitle(draft: OrderDraft): string {
  return `${draft.title}${draft.spec ? ` (${draft.spec})` : ''}`;
}

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

export function startDraft(input: {
  productId: string; variantId: string; title: string; spec: string; price: number; stock: number;
}): OrderDraft {
  return { ...input, step: 'quantity', updatedAt: new Date().toISOString() };
}

function quantityButtons(draft: OrderDraft): BotButton[][] {
  const max = Math.min(draft.stock, MAX_QUANTITY);
  const quick = [1, 2, 3, 4, 5].filter(value => value <= max);
  const rows: BotButton[][] = [];
  for (let index = 0; index < quick.length; index += 3) {
    rows.push(quick.slice(index, index + 3).map(value => ({ text: `${value.toLocaleString('fa-IR')} عدد`, data: `flow:q:${value}` })));
  }
  rows.push([{ text: 'لغو سفارش', data: 'flow:cancel' }]);
  return rows;
}

/** متن مرحله‌ی جاری. */
export function promptFor(draft: OrderDraft, telegramName = ''): BotReply {
  switch (draft.step) {
    case 'quantity':
      return {
        kind: 'order',
        text: [
          `سفارش ${draftTitle(draft)}`,
          `${toman(draft.price)} · موجودی: ${draft.stock.toLocaleString('fa-IR')} عدد`,
          '',
          `چند عدد می‌خواهید؟ (عدد بفرستید یا یکی از دکمه‌ها را بزنید)`,
        ].join('\n'),
        buttons: quantityButtons(draft),
      };
    case 'name':
      return {
        kind: 'order',
        text: 'نام و نام خانوادگی گیرنده را بنویسید:',
        buttons: telegramName
          ? [[{ text: `همان «${telegramName}»`, data: 'flow:name:self' }], [{ text: 'لغو سفارش', data: 'flow:cancel' }]]
          : [[{ text: 'لغو سفارش', data: 'flow:cancel' }]],
      };
    case 'phone':
      return {
        kind: 'order',
        text: 'شماره‌ی موبایل برای هماهنگی پست را بنویسید (مثل ۰۹۱۲۳۴۵۶۷۸۹):',
        buttons: [[{ text: 'لغو سفارش', data: 'flow:cancel' }]],
      };
    case 'address':
      return {
        kind: 'order',
        text: ['نشانی کامل پست را بنویسید:', 'استان، شهر، خیابان، پلاک و کد پستی.'].join('\n'),
        buttons: [[{ text: 'لغو سفارش', data: 'flow:cancel' }]],
      };
    case 'confirm':
      return {
        kind: 'order',
        text: [
          '🧾 پیش‌فاکتور سفارش شما',
          '',
          draftTitle(draft),
          priceLine(draft),
          '',
          `گیرنده: ${draft.name ?? '—'}`,
          `موبایل: ${draft.phone ?? '—'}`,
          `نشانی: ${draft.address ?? '—'}`,
          '',
          'اطلاعات درست است؟ با تأیید، لینک پرداخت برایتان می‌آید.',
        ].join('\n'),
        buttons: [
          [{ text: '✅ تأیید و دریافت لینک پرداخت', data: 'flow:confirm' }],
          [{ text: 'لغو سفارش', data: 'flow:cancel' }],
        ],
      };
    case 'paying':
      return {
        kind: 'order',
        text: 'منتظر پرداخت هستم. اگر لینک را گم کردید، /orders یا /help را بزنید.',
        buttons: [[{ text: 'لغو سفارش', data: 'flow:cancel' }]],
      };
    default:
      return { kind: 'order', text: 'ادامه بدهید.' };
  }
}

/**
 * مرحله‌ی بعد بر اساس ورودی مشتری (متن یا دکمه).
 * هر خطای ورودی، همان مرحله را با پیام روشن تکرار می‌کند؛ هیچ‌وقت مشتری از
 * جریان بیرون نمی‌افتد مگر خودش لغو کند.
 */
export function applyInput(draft: OrderDraft, input: { text?: string; data?: string; telegramName?: string }): FlowOutcome {
  const text = (input.text ?? '').trim();
  const data = input.data ?? '';

  if (data === 'flow:cancel' || /^(لغو|انصراف|بیخیال|بی‌خیال)$/u.test(text)) {
    return { kind: 'cancel', reply: { kind: 'order', text: 'سفارش لغو شد. هر وقت خواستید دوباره شروع کنیم.' } };
  }

  // دکمه‌های ساده در هر مرحله معنا دارند
  if (data === 'flow:name:self') {
    const name = (input.telegramName ?? '').trim();
    if (!name) return { kind: 'invalid', draft, reply: { kind: 'order', text: 'نام تلگرام شما در دسترس نیست؛ نام گیرنده را بنویسید.' } };
    const next = { ...draft, name, step: 'phone' as const, updatedAt: new Date().toISOString() };
    return { kind: 'prompt', draft: next, reply: promptFor(next, input.telegramName) };
  }

  if (draft.step === 'quantity') {
    const raw = data.startsWith('flow:q:') ? data.slice('flow:q:'.length) : text;
    const quantity = Number(toLatinDigits(raw).replace(/[^\d]/g, ''));
    if (!Number.isInteger(quantity) || quantity < 1) {
      return { kind: 'invalid', draft, reply: { ...promptFor(draft), text: `تعداد معتبر نیست.\n\n${promptFor(draft).text}` } };
    }
    if (quantity > Math.min(draft.stock, MAX_QUANTITY)) {
      const max = Math.min(draft.stock, MAX_QUANTITY);
      return {
        kind: 'invalid',
        draft,
        reply: { ...promptFor(draft), text: `حداکثر ${max.toLocaleString('fa-IR')} عدد می‌توانید سفارش دهید (موجودی/سقف هر سفارش).\n\n${promptFor(draft).text}` },
      };
    }
    const next = { ...draft, quantity, step: 'name' as const, updatedAt: new Date().toISOString() };
    return { kind: 'prompt', draft: next, reply: promptFor(next, input.telegramName) };
  }

  if (draft.step === 'name') {
    if (text.length < 3) {
      return { kind: 'invalid', draft, reply: { ...promptFor(draft, input.telegramName), text: `نام را کامل بنویسید.\n\n${promptFor(draft, input.telegramName).text}` } };
    }
    const next = { ...draft, name: text.slice(0, 80), step: 'phone' as const, updatedAt: new Date().toISOString() };
    return { kind: 'prompt', draft: next, reply: promptFor(next, input.telegramName) };
  }

  if (draft.step === 'phone') {
    const phone = normalizePhone(text);
    if (!phone) {
      return { kind: 'invalid', draft, reply: { ...promptFor(draft), text: `شماره معتبر نیست. موبایل ۱۱ رقمی بفرستید (۰۹…).\n\n${promptFor(draft).text}` } };
    }
    const next = { ...draft, phone, step: 'address' as const, updatedAt: new Date().toISOString() };
    return { kind: 'prompt', draft: next, reply: promptFor(next, input.telegramName) };
  }

  if (draft.step === 'address') {
    if (text.length < 10) {
      return { kind: 'invalid', draft, reply: { ...promptFor(draft), text: `نشانی را کامل‌تر بنویسید (حداقل ۱۰ کاراکتر).\n\n${promptFor(draft).text}` } };
    }
    const next = { ...draft, address: text.slice(0, 400), step: 'confirm' as const, updatedAt: new Date().toISOString() };
    return { kind: 'prompt', draft: next, reply: promptFor(next) };
  }

  if (draft.step === 'confirm') {
    if (data === 'flow:confirm' || /^(تأیید|تایید|بله|درسته|باشه)$/u.test(text)) {
      return { kind: 'ready', draft, reply: { kind: 'order', text: 'در حال ساخت لینک پرداخت…' } };
    }
    return { kind: 'invalid', draft, reply: { ...promptFor(draft), text: `برای ادامه دکمه‌ی «تأیید» را بزنید یا «لغو» بفرستید.` } };
  }

  return { kind: 'invalid', draft, reply: promptFor(draft) };
}

/** خلاصه‌ی سفارش برای فروشنده و صفحه‌ی پرداخت. */
export function summaryLines(draft: Pick<OrderDraft, 'title' | 'spec' | 'price' | 'quantity'>): string[] {
  return [
    `${draft.title}${draft.spec ? ` (${draft.spec})` : ''}`,
    priceLine({ ...draft, stock: 0 } as OrderDraft),
  ];
}
