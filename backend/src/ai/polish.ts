import type { BotReply } from '../telegram/brain';
import type { AiService } from './ai.service';
import { escapeHtml } from '../telegram/order-flow';

/**
 * «جان دادن» به پاسخ‌های آماده — بدون تغییر واقعیت.
 *
 * چرا لازم است: پاسخ‌های قاعده‌محور دقیق‌اند ولی خشک؛ مشتری حس می‌کند با یک
 * منو حرف می‌زند، نه با فروشنده. اینجا همان پاسخ **به مدل داده می‌شود** تا با
 * لحن فروشگاه بازنویسی شود — ولی با یک نگهبان سخت‌گیر:
 *
 *  - هیچ عددی اضافه یا حذف نمی‌شود (قیمت، موجودی، تعداد، درصد تخفیف).
 *  - کد محصول (`<code>ABC123</code>`) دست‌نخورده می‌ماند.
 *  - ساختار پیام (خط‌ها، تگ‌های `<b>`/`<i>`) حفظ می‌شود؛ خروجی مارک‌داون یا
 *    متن خالی جایگزین ساختار نمی‌شود.
 *  - هیچ واقعیت تازه‌ای (ارسال رایگان، تخفیف، زمان تحویل) ساخته نمی‌شود.
 *  - اگر نگهبان رد کند، **همان متن اصلی** به مشتری می‌رسد.
 *
 * یعنی مدل آزاد است لحن بسازد، ولی داده در اختیار او نیست.
 */

/** دلایلی که بازنویسی می‌شوند: پاسخ‌های اطلاعاتی، نه مراحل سفارش و نه ارجاع. */
export const POLISHABLE = new Set([
  'greeting', 'thanks', 'price', 'stock', 'product', 'out_of_stock',
  'product_not_found', 'ai_match', 'ai_candidates',
]);

function polishable(reply: BotReply): boolean {
  const reason = reply.reason ?? '';
  // مراحل سفارش و ارجاع به فروشنده هرگز بازنویسی نمی‌شوند: در سفارش، متن دقیق
  // است (شماره‌ی مرحله، ورودی معتبر) و در ارجاع، پیام برای فروشنده است.
  if (reply.kind === 'handoff' || reply.kind === 'order') return false;
  if (reason.startsWith('unclear') || reason.startsWith('no_data')) return false;
  if (POLISHABLE.has(reason)) return true;
  // `answer_price_shipping` و مانند آن‌ها: پاسخ‌های اطلاعاتی چندبخشی.
  return reason.startsWith('answer_') || reason === '';
}

/** همه‌ی عددهای متن (فارسی و لاتین) برای مقایسه‌ی قبل/بعد. */
function numbers(text: string): string[] {
  const found = text.match(/[0-9۰-۹][0-9۰-۹٬,.]*/g) ?? [];
  return found.map(value => value.replace(/[٬,]/g, '').replace(/[۰-۹]/g, digit => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit))));
}

/** کدهای محصول داخل `<code>`؛ باید عیناً برگردند. */
function codes(text: string): string[] {
  return [...text.matchAll(/<code>([^<]+)<\/code>/g)].map(match => match[1]);
}

export type PolishResult =
  | { ok: true; text: string }
  | { ok: false; reason: string };

/**
 * نگهبان خروجی بازنویسی.
 *
 * عمداً سخت‌گیر است: یک قیمت اشتباه در فروشگاه، بدتر از یک جمله‌ی خشک است.
 */
export function guardPolish(original: string, rewritten: string): PolishResult {
  const before = numbers(original);
  const after = numbers(rewritten);
  const beforeSet = new Set(before);
  const afterSet = new Set(after);

  for (const value of beforeSet) {
    if (!afterSet.has(value)) return { ok: false, reason: `number_missing:${value}` };
  }
  for (const value of afterSet) {
    if (!beforeSet.has(value)) return { ok: false, reason: `number_added:${value}` };
  }
  for (const code of codes(original)) {
    if (!rewritten.includes(code)) return { ok: false, reason: `code_missing:${code}` };
  }
  // کد محصولِ تازه هم ممنوع: هیچ <code> تازه‌ای نباید ساخته شود.
  for (const code of codes(rewritten)) {
    if (!original.includes(code)) return { ok: false, reason: `code_added:${code}` };
  }
  const tag = (text: string, name: string) => (text.match(new RegExp(`<${name}>`, 'g')) ?? []).length;
  for (const name of ['b', 'code']) {
    if (tag(original, name) !== tag(rewritten, name)) return { ok: false, reason: `tags_changed:${name}` };
  }
  if (rewritten.length < original.length * 0.55 || rewritten.length > original.length * 1.9) {
    return { ok: false, reason: 'length_out_of_range' };
  }
  if (rewritten.trim().length === 0) return { ok: false, reason: 'empty' };
  // خروجی نباید مارک‌داون باشد؛ تلگرام آن را به‌صورت ستاره و خط‌تیره نشان می‌دهد.
  if (/\*\*|^#{1,3}\s|```/m.test(rewritten)) return { ok: false, reason: 'markdown' };
  return { ok: true, text: rewritten };
}

function systemPrompt(shop: { name: string; tone?: string }): string {
  return [
    'تو «بازنویس» پیام‌های یک فروشگاه اینترنتی فارسی هستی.',
    'ورودی، یک پیام آماده و درست است؛ کار تو فقط بهتر کردن لحن آن است، نه تغییر اطلاعات.',
    '',
    `لحن فروشگاه: ${(shop.tone ?? '').trim() || 'صمیمی، محترمانه، کوتاه و مطمئن'}`,
    '',
    'قواعد سخت (نقض هرکدام = خروجی بی‌اعتبار):',
    '۱) هیچ عددی را عوض، اضافه یا حذف نکن؛ قیمت، موجودی و شماره‌ها را عیناً نگه دار.',
    '۲) متن داخل <code> را هرگز تغییر نده و <code> تازه نساز.',
    '۳) هر واقعیتی که در ورودی نیست (تخفیف، ارسال رایگان، زمان تحویل، برند) نساز.',
    '۴) ساختار را نگه دار: همان تعداد خط، همان نقطه‌ها، همان ایموجی‌های ابتدای خط.',
    '۵) تگ‌های <b> و <i> و <code> را مثل ورودی نگه دار؛ هیچ تگ تازه‌ای اضافه نکن.',
    '۶) بدون مارک‌داون (**، ##، ```). فقط متن فارسی + همان تگ‌های مجاز.',
    '۷) از حرف‌های تشریفاتی طولانی و تکرار «سلام» پرهیز کن؛ یک نفس انسانی بده، نه چند جمله‌ی تزئینی.',
    '۸) خروجی فقط همان پیام است، بدون توضیح و بدون نقل‌قول.',
  ].join('\n');
}

function userPrompt(original: string, question: string): string {
  return [
    '## پیام مشتری',
    question.slice(0, 400),
    '',
    '## پیام آماده (بازنویسی کن)',
    original,
  ].join('\n');
}

/**
 * بازنویسی یک پاسخ آماده.
 *
 * @param ai     سرویس مدل (اگر خاموش باشد، متن اصلی برمی‌گردد)
 * @param reply  پاسخ قاعده‌محور/تطبیق‌شده
 * @param text   پیام مشتری، برای زمینه
 */
export async function polishReply(
  ai: AiService,
  shop: { name: string; tone?: string },
  reply: BotReply,
  text: string,
): Promise<PolishResult> {
  if (!ai.enabled) return { ok: false, reason: 'ai_disabled' };
  if ((process.env.AI_POLISH ?? 'true').trim() === 'false') return { ok: false, reason: 'polish_disabled' };
  if (!polishable(reply)) return { ok: false, reason: 'not_polishable' };
  // پاسخ‌های خیلی کوتاه («باشه»، «در خدمتم») نیازی به بازنویسی ندارند.
  if (reply.text.trim().length < 24) return { ok: false, reason: 'too_short' };

  const raw = await ai.complete(systemPrompt(shop), userPrompt(reply.text, text), undefined, {
    temperature: 0.55,
    maxTokens: Math.min(700, Math.max(240, Math.round(reply.text.length / 2))),
  });
  if (!raw) return { ok: false, reason: 'no_answer' };

  // مدل ممکن است متن را در گیومه یا بلوک بگذارد؛ همان محتوا را برمی‌داریم.
  const cleaned = raw
    .replace(/^```[a-z]*\s*/i, '')
    .replace(/```$/, '')
    .replace(/^["'«]\s*/, '')
    .replace(/\s*["'»]$/, '')
    .trim();
  const guard = guardPolish(reply.text, cleaned);
  if (!guard.ok) return guard;
  return { ok: true, text: guard.text };
}

/** برای پیش‌نمایش پنل و تست: escape یک متن ساده به HTML تلگرام. */
export function toTelegramHtml(text: string): string {
  return escapeHtml(text);
}
