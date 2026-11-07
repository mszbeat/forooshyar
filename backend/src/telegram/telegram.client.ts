/**
 * کلاینت کم‌ضخامت Bot API تلگرام.
 *
 * چرا خودمان نوشتیم و از کتابخانه‌ی poll استفاده نمی‌کنیم:
 *  - روی Render پلن Free سرویس می‌خوابد؛ long-polling در چنین محیطی بدترین
 *    انتخاب است. ما از **webhook** استفاده می‌کنیم که تلگرام خودش push می‌کند.
 *  - `TELEGRAM_API_BASE` قابل تنظیم است تا در تست‌ها یک سرور جعلی جای تلگرام
 *    بنشیند و کل جریان بدون شبکه‌ی واقعی و بدون توکن واقعی تست شود.
 *
 * این کلاس هرگز throw نمی‌کند؛ نتیجه را برمی‌گرداند. یک خطای تلگرام نباید
 * پاسخ به مشتری یا ثبت سفارش را بشکند.
 */

export type TelegramApiResult<T> =
  | { ok: true; result: T }
  | { ok: false; error: string; retryAfter?: number; description?: string };

export type TelegramConfig = {
  token: string;
  baseUrl: string;
  timeoutMs: number;
};

export type SendMessagePayload = {
  chat_id: string | number;
  text: string;
  parse_mode?: 'HTML' | 'MarkdownV2';
  disable_web_page_preview?: boolean;
  reply_markup?: unknown;
};

export function readTelegramConfig(env: NodeJS.ProcessEnv = process.env): TelegramConfig {
  return {
    token: (env.TELEGRAM_BOT_TOKEN ?? '').trim(),
    // برای تست: http://127.0.0.1:PORT
    baseUrl: (env.TELEGRAM_API_BASE ?? 'https://api.telegram.org').replace(/\/+$/, ''),
    timeoutMs: Number(env.TELEGRAM_TIMEOUT_MS ?? 10000),
  };
}

export class TelegramClient {
  constructor(private readonly config: TelegramConfig) {}

  get configured(): boolean {
    return this.config.token.length > 0;
  }

  /** نام کاربری بات، برای ساختن لینک t.me/<username>?start=<code>. */
  async getMe(): Promise<TelegramApiResult<{ id: number; username?: string }>> {
    return this.call<{ id: number; username?: string }>('getMe', {});
  }

  async sendMessage(payload: SendMessagePayload): Promise<TelegramApiResult<{ message_id: number }>> {
    return this.call<{ message_id: number }>('sendMessage', payload);
  }

  async setWebhook(url: string, secretToken: string): Promise<TelegramApiResult<true>> {
    return this.call<true>('setWebhook', {
      url,
      secret_token: secretToken,
      allowed_updates: ['message', 'edited_message'],
      drop_pending_updates: false,
    });
  }

  async deleteWebhook(): Promise<TelegramApiResult<true>> {
    return this.call<true>('deleteWebhook', { drop_pending_updates: false });
  }

  async getWebhookInfo(): Promise<TelegramApiResult<{ url?: string; last_error_message?: string; pending_update_count?: number }>> {
    return this.call('getWebhookInfo', {});
  }

  private async call<T>(method: string, body: unknown): Promise<TelegramApiResult<T>> {
    if (!this.configured) {
      return { ok: false, error: 'not_configured', description: 'TELEGRAM_BOT_TOKEN ست نشده است.' };
    }
    const url = `${this.config.baseUrl}/bot${this.config.token}/${method}`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });
      const payload = await response.json().catch(() => null) as
        | { ok?: boolean; result?: T; description?: string; parameters?: { retry_after?: number } }
        | null;

      if (response.ok && payload?.ok) return { ok: true, result: payload.result as T };

      return {
        ok: false,
        error: `http_${response.status}`,
        description: payload?.description,
        retryAfter: payload?.parameters?.retry_after,
      };
    } catch (error) {
      const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
      return { ok: false, error: timedOut ? 'timeout' : 'network' };
    }
  }
}

/** پیام تلگرام حداکثر ۴۰۹۶ کاراکتر است؛ بلندتر را تکه می‌کنیم تا نصفه نماند. */
export function splitMessage(text: string, limit = 4000): string[] {
  if (text.length <= limit) return [text];
  const parts: string[] = [];
  let rest = text;
  while (rest.length > limit) {
    let cut = rest.lastIndexOf('\n', limit);
    if (cut < limit * 0.5) cut = rest.lastIndexOf(' ', limit);
    if (cut < limit * 0.5) cut = limit;
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}
