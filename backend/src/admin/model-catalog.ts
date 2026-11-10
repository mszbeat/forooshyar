import { Logger } from '@nestjs/common';
import { AI_PROVIDERS, type AiModel, type AiProvider } from './settings.catalog';

/**
 * فهرست مدل‌ها، زنده از خودِ ارائه‌دهنده.
 *
 * چرا: فهرست ثابت `AI_PROVIDERS` خیلی زود کهنه می‌شود (مدل تازه می‌آید، مدل
 * بازنشسته می‌شود) و ادمین مجبور می‌شد نام مدل را دستی بنویسد — همان چیزی که
 * کاربر گزارش کرد. اینجا با استاندارد OpenAI، `GET {baseUrl}/models` صدا زده
 * می‌شود؛ همان کلید و همان آدرسی که برای گفتگو استفاده می‌شود.
 *
 * قواعد عمدی:
 *  - شکست شبکه هرگز خطا نمی‌دهد؛ به فهرست پیشنهادی کاتالوگ برمی‌گردیم تا پنل
 *    خالی نشود (مثلاً سرور بدون اینترنت یا کلید نامعتبر).
 *  - نتیجه ۱۰ دقیقه کش می‌شود: هر بار باز کردن صفحه نباید به ارائه‌دهنده شلیک
 *    کند (هم سهمیه، هم سرعت).
 */

type ModelsPayload = { data?: { id?: string; name?: string; context_length?: number; pricing?: Record<string, string> }[] };

const logger = new Logger('AiModels');
const TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { at: number; models: AiModel[] }>();

/** برچسب خوانا از شناسهٔ مدل: `openai/gpt-4o-mini` → `GPT-4o mini`. */
function pretty(id: string): string {
  const tail = id.includes('/') ? id.split('/').pop()! : id;
  const cleaned = tail.replace(/[-_]/g, ' ');
  return cleaned.replace(/\b([a-z])/g, match => match.toUpperCase()).replace(/\s+/g, ' ').trim();
}

/** فقط مدل‌های گفتگویی؛ مدل‌های امبدینگ/تصویر/صدا در این پنل کاربردی ندارند. */
function isChatModel(id: string): boolean {
  return !/(embed|whisper|tts|dall-e|moderation|rerank|image|vision-ocr|audio)/i.test(id);
}

function toModel(id: string, entry?: { name?: string; pricing?: Record<string, string> }): AiModel {
  const free = id.endsWith(':free') || (entry?.pricing?.prompt === '0' && entry?.pricing?.completion === '0');
  return {
    value: id,
    label: entry?.name?.trim() || pretty(id),
    ...(free ? { free: true, hint: 'رایگان' } : {}),
  };
}

export type ModelListResult = {
  provider: string;
  live: boolean;
  fetchedAt: string;
  models: AiModel[];
  error?: string;
};

/**
 * @param providerId شناسهٔ درگاه در کاتالوگ
 * @param overrides  آدرسی که ادمین در فرم نوشته (قبل از ذخیره) تا فهرستِ
 *                   همان آدرس دیده شود، نه آدرس قدیمی.
 */
export async function listModels(
  providerId: string,
  overrides: { baseUrl?: string; apiKey?: string; refresh?: boolean } = {},
): Promise<ModelListResult> {
  const provider: AiProvider = AI_PROVIDERS.find(item => item.id === providerId) ?? AI_PROVIDERS[0];
  const baseUrl = (overrides.baseUrl || provider.baseUrl).replace(/\/+$/, '');
  const apiKey = (overrides.apiKey || process.env.AI_API_KEY || '').trim();
  const fallback = (): ModelListResult => ({
    provider: provider.id, live: false, fetchedAt: new Date().toISOString(), models: provider.models,
  });

  if (!baseUrl) return { ...fallback(), error: 'آدرس درگاه خالی است.' };

  const key = `${baseUrl}|${apiKey.slice(0, 6)}`;
  const hit = cache.get(key);
  if (!overrides.refresh && hit && Date.now() - hit.at < TTL_MS) {
    return { provider: provider.id, live: true, fetchedAt: new Date(hit.at).toISOString(), models: hit.models };
  }

  try {
    const response = await fetch(`${baseUrl}/models`, {
      headers: { ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) },
      signal: AbortSignal.timeout(Number(process.env.AI_MODELS_TIMEOUT_MS ?? 6000)),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      logger.warn(`فهرست مدل‌ها نیامد (${response.status}): ${body.slice(0, 140)}`);
      return { ...fallback(), error: `ارائه‌دهنده ${response.status} برگرداند؛ فهرست پیشنهادی نمایش داده می‌شود.` };
    }
    const payload = (await response.json()) as ModelsPayload;
    const seen = new Set<string>();
    const models = (payload.data ?? [])
      .filter(entry => typeof entry.id === 'string' && entry.id.length > 0 && isChatModel(entry.id))
      .filter(entry => (seen.has(entry.id!) ? false : (seen.add(entry.id!), true)))
      .map(entry => toModel(entry.id!, entry))
      .sort((a, b) => Number(Boolean(b.free)) - Number(Boolean(a.free)) || a.label.localeCompare(b.label));

    if (!models.length) return { ...fallback(), error: 'ارائه‌دهنده فهرست خالی داد؛ فهرست پیشنهادی نمایش داده می‌شود.' };
    cache.set(key, { at: Date.now(), models });
    return { provider: provider.id, live: true, fetchedAt: new Date().toISOString(), models };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'خطای نامشخص';
    logger.warn(`دریافت فهرست مدل‌ها ناموفق: ${message}`);
    return { ...fallback(), error: 'ارتباط با ارائه‌دهنده برقرار نشد؛ فهرست پیشنهادی نمایش داده می‌شود.' };
  }
}

/** پاک‌کردن کش؛ بعد از ذخیرهٔ تنظیمات تا فهرست با آدرس تازه بگیرد. */
export function clearModelCache(): void {
  cache.clear();
}
