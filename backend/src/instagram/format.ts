import type { BotButton } from '../telegram/brain';
import type { InstagramButton, InstagramQuickReply } from './instagram.client';

/**
 * تبدیل خروجی مغز بات (که برای تلگرام نوشته شده) به چیزی که اینستاگرام
 * می‌فهمد.
 *
 * چرا این لایه لازم است: مغز بات متن را با تگ‌های سبک تلگرام (`<b>`، `<i>`،
 * `<code>`) می‌سازد و دکمه‌ها را در ردیف‌های نامحدود می‌چیند. دایرکت اینستاگرام
 * نه HTML می‌فهمد و نه بیشتر از ۳ دکمه در یک پیام قبول می‌کند (عنوان هر دکمه هم
 * حداکثر ۲۰ کاراکتر است). اگر این تبدیل انجام نشود، مشتری یا تگ خام می‌بیند یا
 * BoxAPI پیام را با خطای اعتبارسنجی رد می‌کند.
 */

/** سقف کاراکتر یک پیام دایرکت. */
export const INSTAGRAM_MESSAGE_LIMIT = 1000;
/** حداکثر دکمه در یک پیام دایرکت. */
export const INSTAGRAM_BUTTON_LIMIT = 3;
/** حداکثر پاسخ سریع. */
export const INSTAGRAM_QUICK_REPLY_LIMIT = 13;
/** حداکثر طول عنوان دکمه. */
export const INSTAGRAM_TITLE_LIMIT = 20;

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&nbsp;': ' ',
};

/**
 * حذف تگ‌های HTML و بازگرداندن موجودیت‌ها.
 *
 * `<br>`/`</p>` به خط جدید تبدیل می‌شوند تا ساختار پیام (که مغز بات عمداً
 * با فاصله‌گذاری ساخته) به هم نریزد.
 */
export function toPlainText(input: string): string {
  return input
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&[a-z#0-9]+;/gi, entity => ENTITIES[entity.toLowerCase()] ?? entity)
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** بریدن عنوان دکمه با سه‌نقطه، طوری که شمارش کاراکتر از سقف رد نشود. */
function title(text: string): string {
  const clean = toPlainText(text).replace(/\s+/g, ' ').trim();
  return clean.length <= INSTAGRAM_TITLE_LIMIT
    ? clean
    : `${clean.slice(0, INSTAGRAM_TITLE_LIMIT - 1).trimEnd()}…`;
}

export type InstagramActions = {
  /**
   * دکمه‌های «قالب» اینستاگرام. عمداً همیشه خالی است: آرایه‌ی `buttons` در
   * پیام متنی، مفهوم مسنجر است و اینستاگرام آن را رندر نمی‌کند (حتی در اپ).
   * دکمه در اینستاگرام فقط داخل `generic_template` معنا دارد.
   */
  buttons?: InstagramButton[];
  quickReplies?: InstagramQuickReply[];
  /**
   * دکمه‌های لینک‌داری که در حالت «پاسخ سریع» جا نشدند؛ سرویس آن‌ها را به آخر
   * متن پیام می‌چسباند، وگرنه مشتری راهی برای باز کردن لینک نداشت.
   */
  links: string[];
};

/**
 * نگاشت دکمه‌های مغز بات به «پاسخ سریع» اینستاگرام.
 *
 * چرا فقط پاسخ سریع: در اینستاگرام آرایه‌ی `buttons` روی پیام متنی پشتیبانی
 * نمی‌شود و بی‌صدا دور ریخته می‌شود؛ پاسخ سریع تا ۱۳ عدد مجاز است و در اپ
 * موبایل به‌صورت چیپ زیر پیام می‌آید. در نسخه‌ی وب/دسکتاپ هیچ‌کدام دیده
 * نمی‌شوند (محدودیت خود متا)، برای همین سرویس در متن پیام هم شماره و کد
 * محصول را می‌نویسد و ورودی عددی را می‌پذیرد.
 *
 * دکمه‌ی لینک‌دار: به‌جای `web_url`، یک پاسخ سریع با payload `url:` و آدرس
 * پیوست‌شده به متن — هیچ کلاینتی لینک را از دست نمی‌دهد.
 */
export function toInstagramActions(rows?: BotButton[][]): InstagramActions {
  const flat = (rows ?? []).flat().filter(button => button.text?.trim());
  if (flat.length === 0) return { links: [] };

  const links: string[] = [];
  const quickReplies: InstagramQuickReply[] = [];
  for (const button of flat) {
    if (button.url) links.push(button.url);
    if (quickReplies.length >= INSTAGRAM_QUICK_REPLY_LIMIT) continue;
    quickReplies.push({
      content_type: 'text',
      title: title(button.text),
      payload: (button.url ? `url:${button.url}` : (button.data ?? '')).slice(0, 1000),
    });
  }
  return { quickReplies, links: links.slice(0, 2) };
}

/**
 * شکستن متن بلند به چند پیام.
 *
 * اینستاگرام پیام بیش از ۱۰۰۰ کاراکتر را رد می‌کند؛ فهرست محصولات به‌راحتی از
 * این عدد رد می‌شود. برش روی مرز خط است تا وسط جمله یا وسط یک لینک نبرد.
 */
export function splitInstagramMessage(text: string, limit = INSTAGRAM_MESSAGE_LIMIT): string[] {
  const clean = text.trim();
  if (clean.length <= limit) return clean ? [clean] : [];

  const parts: string[] = [];
  let buffer = '';
  for (const line of clean.split('\n')) {
    if (line.length > limit) {
      // خط تک‌تکه‌ی بلند (مثلاً یک آدرس): برش سخت.
      if (buffer) { parts.push(buffer); buffer = ''; }
      for (let index = 0; index < line.length; index += limit) parts.push(line.slice(index, index + limit));
      continue;
    }
    if ((buffer ? `${buffer}\n${line}` : line).length > limit) {
      parts.push(buffer);
      buffer = line;
      continue;
    }
    buffer = buffer ? `${buffer}\n${line}` : line;
  }
  if (buffer.trim()) parts.push(buffer);
  return parts;
}
