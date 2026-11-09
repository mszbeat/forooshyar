import type { BotCommand, ReplyMarkup } from './telegram.client';

/**
 * «ظاهر حرفه‌ای» بات: فهرست فرمان‌ها، کیبورد عملیات و متن راهنما — همه در یک جا.
 *
 * چرا این‌جا و نه در سرویس: هر سه مورد به هم وابسته‌اند (دکمه‌ای که در کیبورد
 * هست باید در راهنما هم توضیح داده شود و همان کار را بکند). یک منبع واحد
 * نگه‌داشتن باعث می‌شود اضافه‌کردن یک عملیات تازه، سه جای مختلف را فراموش نکند.
 *
 * نکته‌ی مهم درباره‌ی متن دکمه‌ها: کیبورد تلگرام فقط **متن** می‌فرستد، نه
 * callback. پس متن هر دکمه باید چیزی باشد که موتور تشخیص نیت (`understanding.ts`)
 * خودش بفهمد؛ وگرنه مشتری دکمه می‌زند و بات «نفهمیدم» می‌دهد.
 */

/** فرمان‌های ☰ — کنار آیکون پیوست فایل، در همه‌ی کلاینت‌های تلگرام. */
export const BOT_COMMANDS: BotCommand[] = [
  { command: 'start', description: 'شروع و معرفی فروشگاه' },
  { command: 'products', description: 'فهرست محصولات و قیمت‌ها' },
  { command: 'help', description: 'بات چه کارهایی می‌تواند بکند؟' },
  { command: 'orders', description: 'سفارش‌های من' },
  { command: 'stop', description: 'بستن گفتگو و توقف پیام‌ها' },
];

/** متن دکمه‌ها؛ هر کدام به یک نیت شناخته‌شده می‌رسد. */
export const KEYBOARD_ACTIONS = {
  catalog: '🛍 محصولات و قیمت‌ها',
  order: '🧾 ثبت سفارش',
  shipping: '🚚 ارسال و تحویل',
  hours: '🕒 ساعت کاری',
  returns: '↩️ مرجوعی و تعویض',
  payment: '💳 روش پرداخت',
  human: '🧑‍💼 صحبت با فروشنده',
  help: '❓ راهنما',
} as const;

/**
 * کیبورد پایین چت.
 *
 * `is_persistent` یعنی با بستن کیبورد هم دوباره برمی‌گردد — مشتری همیشه
 * دسترسی یک‌ضربه‌ای به عملیات‌ها دارد و لازم نیست چیزی تایپ کند.
 */
export function actionsKeyboard(): ReplyMarkup {
  return {
    is_persistent: true,
    resize_keyboard: true,
    input_field_placeholder: 'سؤال‌تان را بنویسید…',
    keyboard: [
      [{ text: KEYBOARD_ACTIONS.catalog }, { text: KEYBOARD_ACTIONS.order }],
      [{ text: KEYBOARD_ACTIONS.shipping }, { text: KEYBOARD_ACTIONS.hours }],
      [{ text: KEYBOARD_ACTIONS.returns }, { text: KEYBOARD_ACTIONS.payment }],
      [{ text: KEYBOARD_ACTIONS.human }, { text: KEYBOARD_ACTIONS.help }],
    ],
  };
}

/** دکمه‌هایی که باید مثل فرمان رفتار کنند (چون کیبورد فقط متن می‌فرستد). */
export const ACTION_TO_COMMAND: Record<string, 'catalog' | 'help' | 'human' | 'order'> = {
  [KEYBOARD_ACTIONS.catalog]: 'catalog',
  [KEYBOARD_ACTIONS.help]: 'help',
  [KEYBOARD_ACTIONS.human]: 'human',
  [KEYBOARD_ACTIONS.order]: 'order',
};

/** متن راهنمای بات؛ از خود تنظیمات فروشگاه ساخته می‌شود تا هرگز خالی نباشد. */
export function helpText(shop: { name: string; shipping: string; payment: string; workingHours: string; returns: string }): string {
  const lines = [
    `<b>راهنمای بات ${escapeHtmlLocal(shop.name)}</b>`,
    'می‌توانم این کارها را انجام دهم:',
    '',
    '• <b>قیمت و موجودی</b> — نام یا کد محصول را بفرستید، یا یک پست اینستاگرام را فوروارد کنید.',
    '• <b>ثبت سفارش</b> — کامل داخل همین چت، با انتخاب سایز و رنگ.',
    '• <b>ارسال، پرداخت، ساعت کاری و مرجوعی</b> — از تنظیمات خود فروشگاه.',
    '',
    'دستورها: /products فهرست محصولات · /orders سفارش‌های من · /stop بستن گفتگو',
    'دکمه‌های پایین صفحه هم همین کارها را یک‌ضربه‌ای می‌کنند.',
  ];
  return lines.join('\n');
}

function escapeHtmlLocal(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** پیام خوش‌آمد مشتری: کوتاه، حرفه‌ای، با کیبورد عملیات. */
export function welcomeText(shop: { name: string; capabilities: string[] }): string {
  const caps = shop.capabilities.length
    ? `درباره‌ی ${shop.capabilities.join('، ')} می‌توانم همین‌جا جواب بدهم.`
    : 'در خدمتم.';
  return [
    `👋 سلام! به <b>${escapeHtmlLocal(shop.name)}</b> خوش آمدید.`,
    caps,
    '',
    'برای شروع، یکی از دکمه‌های پایین را بزنید یا سؤال‌تان را بنویسید.',
  ].join('\n');
}

/**
 * کدام عملیات پشت این متن است؟
 *
 * دکمه‌های کیبورد فقط متن می‌فرستند؛ این تابع متن را (با نرمال‌سازی ساده) به
 * عملیات نگاشت می‌کند تا دکمه و فرمان یک رفتار داشته باشند.
 */
export function actionOf(raw: string): 'catalog' | 'help' | 'human' | 'order' | null {
  const text = raw.replace(/\u200c/g, ' ').replace(/\s+/g, ' ').trim();
  for (const [label, action] of Object.entries(ACTION_TO_COMMAND)) {
    if (label === text) return action;
  }
  // اگر مشتری ایموجی را پاک کرد یا فاصله‌ها را عوض کرد، بر اساس کلمه‌ی کلیدی.
  if (/^محصولات(\s|$)/.test(text)) return 'catalog';
  // برچسب واقعی دکمه: «🛍 محصولات و قیمت‌ها» — ایموجی پیش از الگو حذف می‌شود.
  const bare = text.replace(/^[\p{Extended_Pictographic}\uFE0F\u200D\s]+/u, '');
  if (/^محصولات(\s|$| و)/.test(bare)) return 'catalog';
  if (/^راهنما$/.test(bare)) return 'help';
  if (/^صحبت با فروشنده$/.test(bare)) return 'human';
  if (/^ثبت سفارش$/.test(bare)) return 'order';
  if (/^راهنما$/.test(text)) return 'help';
  if (/^صحبت با فروشنده$/.test(text)) return 'human';
  if (/^ثبت سفارش$/.test(text)) return 'order';
  return null;
}
