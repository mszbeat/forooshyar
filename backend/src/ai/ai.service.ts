import { Injectable, Logger } from '@nestjs/common';

/**
 * لایه‌ی مدل زبانی — **مستقل از ارائه‌دهنده**.
 *
 * چرا این‌طور نوشته شده:
 *  - پروژه به هیچ SDK خاصی گره نمی‌خورد؛ هر سرویسی که API سازگار با
 *    `POST /chat/completions` داشته باشد (OpenAI، OpenRouter، Together،
 *    vLLM محلی، یا حتی یک مدل فارسی روی سرور خودتان) با تغییر سه متغیر
 *    محیطی وصل می‌شود.
 *  - بدون کلید، بدون خطا و بدون توقف: `enabled` می‌شود `false` و موتور
 *    قاعده‌محور (`composeReply`) مثل قبل کار می‌کند. یعنی نبود مدل هرگز
 *    باعث خرابی بات نمی‌شود.
 *  - به‌طور پیش‌فرض **خاموش** است (`AI_ENABLED=true` لازم است) چون هر
 *    فراخوانی مدل هزینه و تأخیر دارد.
 *
 * متغیرهای محیطی:
 *   AI_ENABLED=true            روشن/خاموش
 *   AI_API_KEY=sk-...          کلید
 *   AI_MODEL=gpt-4o-mini       نام مدل
 *   AI_BASE_URL=https://api.openai.com/v1   (هر درگاه سازگار)
 *   AI_TIMEOUT_MS=12000        سقف زمان انتظار
 *   AI_MAX_OUTPUT_TOKENS=400
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger('Ai');
  private readonly failures = { count: 0, blockedUntil: 0 };

  get enabled(): boolean {
    return this.flag() && Boolean(this.apiKey);
  }

  get model(): string {
    return (process.env.AI_MODEL ?? 'gpt-4o-mini').trim();
  }

  get provider(): string {
    return (process.env.AI_BASE_URL ?? 'https://api.openai.com/v1').trim();
  }

  /** برای پنل: چه چیزی وصل است و آیا الان قابل استفاده است. */
  status() {
    const breakerOpen = Date.now() < this.failures.blockedUntil;
    return {
      enabled: this.enabled,
      ready: this.enabled && !breakerOpen,
      model: this.model,
      provider: this.provider.replace(/\/+$/, ''),
      reason: !this.flag()
        ? 'ai_disabled'
        : !this.apiKey
          ? 'missing_api_key'
          : breakerOpen
            ? 'provider_unavailable'
            : '',
    };
  }

  /**
   * یک نوبت گفتگو با مدل. هر خطا `null` برمی‌گرداند تا مسیر قاعده‌محور ادامه پیدا کند.
   * سه خطای پشت‌سرهم → مدار ۲ دقیقه باز می‌شود و بات دیگر منتظر مدل نمی‌ماند.
   */
  async complete(system: string, user: string, signal?: AbortSignal): Promise<string | null> {
    if (!this.enabled) return null;
    if (Date.now() < this.failures.blockedUntil) return null;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Number(process.env.AI_TIMEOUT_MS ?? 12000));
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });

    try {
      const response = await fetch(`${this.provider.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({
          model: this.model,
          temperature: 0.3,
          max_tokens: Number(process.env.AI_MAX_OUTPUT_TOKENS ?? 400),
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        this.logger.warn(`مدل پاسخ نداد (${response.status}): ${body.slice(0, 160)}`);
        this.trip();
        return null;
      }

      const data = (await response.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const text = data.choices?.[0]?.message?.content?.trim() ?? '';
      if (!text) {
        this.trip();
        return null;
      }
      this.failures.count = 0;
      return text;
    } catch (error) {
      this.logger.warn(`خطای ارتباط با مدل: ${error instanceof Error ? error.message : 'unknown'}`);
      this.trip();
      return null;
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
    }
  }

  private trip() {
    this.failures.count += 1;
    if (this.failures.count >= 3) {
      this.failures.blockedUntil = Date.now() + 120_000;
      this.failures.count = 0;
      this.logger.warn('مدار مدل تا ۲ دقیقه باز شد؛ پاسخ‌دهی قاعده‌محور ادامه دارد.');
    }
  }

  private flag(): boolean {
    return /^(1|true|yes|on)$/i.test((process.env.AI_ENABLED ?? '').trim());
  }

  private get apiKey(): string {
    return (process.env.AI_API_KEY ?? '').trim();
  }
}
