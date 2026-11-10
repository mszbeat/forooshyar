import { describeProduct, clarifyProducts, notFoundReply, type BotReply, type BrainShop } from '../telegram/brain';
import { discover, productTokens, type CatalogProduct } from '../catalog/discovery';
import type { AiService } from './ai.service';
import { answerWithAi } from './answer';
import { interpretWithAi } from './interpret';
import { polishReply } from './polish';
import type { AiMessage } from './context';

export type UnderstandInput = {
  ai: AiService;
  shop: BrainShop;
  products: CatalogProduct[];
  text: string;
  /** پاسخ موتور قاعده‌محور؛ همیشه ورودی این تابع است، نه خروجی موقت. */
  rule: BotReply;
  history?: AiMessage[];
};

export type UnderstandResult = BotReply & {
  /** از کجا آمد: قاعده، تشخیص محصول با مدل، پاسخ مدل، یا بازنویسی لحن. */
  source: 'rules' | 'ai_match' | 'ai_answer' | 'ai_polished';
  /** اگر مدل به کار رفت، برای گزارش و پنل. */
  ai?: { model: string; match?: string; keywords?: string; skip?: string; polished?: boolean };
};

/**
 * تصمیم «آیا این پیام را واقعاً نفهمیدیم؟» با کمک مدل.
 *
 * قاعده‌ی محور خوب است ولی کور است: «می‌خوام قیمت کفش هاتون رو بدونم» وقتی
 * کاتالوگ «کفش لوفر چرم» دارد باید همان را نشان دهد، و وقتی مشتری چیز
 * نامربوطی می‌پرسد باید بگوید پیدا نشد. تفاوت این دو فقط با **خواندن نیت**
 * ممکن است، نه با تطبیق حرف به حرف.
 *
 * ترتیب کار عمدی است و مدل هرگز جایش را با قاعده عوض نمی‌کند:
 *   ۱) پاسخ قاعده‌محور روشن (قیمت یک محصول مشخص، ارسال، پرداخت، سفارش) →
 *      همان برمی‌گردد و مدل حتی صدا زده نمی‌شود (هزینه و تأخیر صفر).
 *   ۲) فقط وقتی قاعده «پیدا نشد» یا «نفهمیدم» می‌گوید، مدل نیت را می‌خواند.
 *   ۳) اگر مدل محصولی از کاتالوگ را شناخت → همان محصول (قیمت/موجودی واقعی).
 *   ۴) اگر محصول را نشناخت ولی واژه‌ی جست‌وجو داد → جست‌وجوی دوباره.
 *   ۵) اگر موضوع فروشگاهی بود → پاسخ با واقعیت‌های فروشگاه (با نگهبان).
 *   ۶) هیچ‌کدام → همان پاسخ قاعده‌محور، بدون تغییر.
 */
export async function resolveReply(input: UnderstandInput): Promise<UnderstandResult> {
  const { ai, shop, products, text, rule } = input;
  const asRule: UnderstandResult = { ...rule, source: 'rules' };
  if (!ai.enabled || products.length === 0) return asRule;

  const reason = rule.reason ?? '';
  const unsure = reason.startsWith('unclear') || reason.startsWith('no_data') || reason === 'product_not_found';
  if (!unsure) return asRule;

  const interpreted = await interpretWithAi(ai, shop, products, text);
  if (!interpreted.ok) return { ...asRule, ai: { model: ai.model, skip: interpreted.reason } };
  const intent = interpreted.data;

  // ۳) مدل عنوان یکی از محصولات موجود را تشخیص داد → قیمت/موجودی همان.
  if (intent.match) {
    const product = products.find(item => item.title === intent.match);
    if (product) {
      const matched: BotReply = describeProduct(product, text);
      return { ...matched, reason: 'ai_match', source: 'ai_match', ai: { model: ai.model, match: intent.match } };
    }
  }

  // ۴) جست‌وجوی دوباره با واژه‌هایی که مدل فهمید.
  if (intent.keywords) {
    const found = discover(intent.keywords, products);
    if (found.kind === 'single') {
      const reply = describeProduct(found.product, text);
      return { ...reply, reason: 'ai_match', source: 'ai_match', ai: { model: ai.model, keywords: intent.keywords } };
    }
    if (found.kind === 'many') {
      const reply = clarifyProducts(found.products, intent.keywords, 0);
      return { ...reply, reason: 'ai_candidates', source: 'ai_match', ai: { model: ai.model, keywords: intent.keywords } };
    }
  }

  // ۵) موضوع فروشگاهی است → پاسخ با مدل، ولی فقط با واقعیت‌های فروشگاه.
  if (intent.intent !== 'product' || intent.needsAnswer) {
    const answer = await answerWithAi(ai, { shop, products, history: input.history }, text);
    if (answer.ok) {
      return {
        kind: 'answer', reason: 'ai_answer', text: answer.text, source: 'ai_answer',
        ai: { model: ai.model, match: intent.match, keywords: intent.keywords },
      };
    }
    return { ...asRule, ai: { model: ai.model, skip: answer.reason } };
  }

  // ۶) مدل هم محصولی پیدا نکرد: «پیدا نشد» صریح، با واژه‌های پاک‌شده.
  const cleanQuery = intent.keywords || productTokens(text).join(' ');
  const finalRule = reason === 'product_not_found' && cleanQuery
    ? notFoundReply(cleanQuery, products)
    : rule;
  return { ...finalRule, source: 'rules', ai: { model: ai.model, keywords: cleanQuery } };
}

/**
 * «جان دادن» به پاسخ نهایی، بدون تغییر داده.
 *
 * چرا جدا از `resolveReply`: آن یکی **چه بگوییم** را تعیین می‌کند و این یکی
 * **چطور بگوییم**. جدا نگه‌داشتنشان دو فایده دارد: مسیر پاسخ‌دادن حتی با خطای
 * مدل دست‌نخورده می‌ماند، و تست می‌تواند هر لایه را تنها بسنجد.
 *
 * اگر بازنویسی رد شود (نگهبان عدد/کد/ساختار)، همان متن قبلی برمی‌گردد؛ پس
 * خروجی این تابع همیشه ایمن است.
 */
export async function addPersonality(
  ai: AiService,
  shop: BrainShop,
  reply: UnderstandResult,
  text: string,
): Promise<UnderstandResult> {
  const polished = await polishReply(ai, shop, reply, text);
  if (!polished.ok) {
    return { ...reply, ai: { ...(reply.ai ?? { model: ai.model }), skip: reply.ai?.skip ?? polished.reason } };
  }
  return {
    ...reply,
    text: polished.text,
    source: reply.source === 'ai_answer' ? 'ai_answer' : 'ai_polished',
    ai: { ...(reply.ai ?? { model: ai.model }), polished: true } as UnderstandResult['ai'],
  };
}
