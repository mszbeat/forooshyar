/**
 * فهرست «تنظیمات پلتفرم» — تنها منبع حقیقت برای پنل ادمین.
 *
 * چرا یک فهرست اعلانی و نه چند فرم دستی:
 *  - اعتبارسنجی، ماسک‌کردن مقادیر حساس، و «آیا با ری‌استارت اثر می‌کند؟» یک‌جا
 *    تعریف می‌شوند؛ پنل و API از همین فهرست ساخته می‌شوند و هیچ‌وقت از هم جدا
 *    نمی‌افتند.
 *  - کلید ناشناخته در درخواست رد می‌شود؛ ادمین نمی‌تواند `JWT_SECRET` یا هر
 *    متغیر دیگری را از پنل عوض کند (چنین تغییری همه‌ی نشست‌ها را می‌شکند).
 *
 * ترتیب اولویت مقدار مؤثر: مقدار ذخیره‌شده در دیتابیس ← متغیر محیطی ← پیش‌فرض کد.
 * متغیر محیطی هرگز از دیتابیس جلو نمی‌زند، چون پنل ادمین باید بتواند روی Render
 * هم بدون Deploy مجدد رفتار سرویس را عوض کند.
 */

export type SettingGroup = 'ai' | 'telegram' | 'payments' | 'database' | 'system';
export type SettingKind = 'bool' | 'text' | 'secret' | 'number' | 'url' | 'choice';

export type SettingDef = {
  key: string;
  group: SettingGroup;
  label: string;
  kind: SettingKind;
  hint?: string;
  placeholder?: string;
  /** خالی گذاشتن مجاز است (مثلاً کلید درگاهی که لازم ندارد) */
  optional?: boolean;
  /** تغییر فقط با ری‌استارت سرویس اثر می‌کند (اتصالات از پیش ساخته شده‌اند) */
  restart?: boolean;
  choices?: { value: string; label: string; hint?: string }[];
  /** پیش‌فرض کد؛ برای نمایش «مقدار مؤثر» وقتی نه در DB و نه در env هست */
  fallback?: string;
  min?: number;
  max?: number;
};

export const GROUPS: { id: SettingGroup; label: string; description: string }[] = [
  { id: 'ai', label: 'مدل هوش مصنوعی', description: 'مدل زبانی که «نفهمیدم»های بات را جواب می‌دهد؛ بدون کلید، بات با موتور قاعده‌محور کار می‌کند.' },
  { id: 'telegram', label: 'تلگرام', description: 'توکن بات، سکرت webhook و آدرس عمومی سرویس.' },
  { id: 'payments', label: 'پرداخت', description: 'درگاه زرین‌پال یا حالت آزمایشی.' },
  { id: 'database', label: 'دیتابیس', description: 'اتصال PostgreSQL؛ تغییر آدرس تا ری‌استارت بعدی اثر نمی‌کند.' },
  { id: 'system', label: 'سیستم', description: 'CORS، کش، لاگ گردش و پرچم‌های عیب‌یابی.' },
];

/**
 * پیش‌تنظیم‌های ارائه‌دهنده‌ی مدل.
 *
 * همه‌شان یک قرارداد دارند: `POST {baseUrl}/chat/completions` با استاندارد
 * OpenAI. به همین دلیل انتخاب ارائه‌دهنده فقط دو فیلد را پر می‌کند، نه یک
 * مسیر کد جداگانه.
 */
export const AI_PROVIDERS: {
  id: string;
  label: string;
  baseUrl: string;
  keyHint: string;
  models: { value: string; label: string; hint?: string }[];
}[] = [
  {
    id: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    keyHint: 'sk-…',
    models: [
      { value: 'gpt-4o-mini', label: 'GPT-4o mini', hint: 'ارزان و سریع؛ پیشنهاد پیش‌فرض' },
      { value: 'gpt-4o', label: 'GPT-4o', hint: 'دقیق‌تر، گران‌تر' },
      { value: 'gpt-4.1-mini', label: 'GPT-4.1 mini' },
      { value: 'o4-mini', label: 'o4-mini', hint: 'استدلالی؛ کندتر' },
    ],
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    keyHint: 'sk-or-…',
    models: [
      { value: 'openai/gpt-4o-mini', label: 'GPT-4o mini' },
      { value: 'google/gemini-2.0-flash-001', label: 'Gemini 2.0 Flash' },
      { value: 'anthropic/claude-3.5-haiku', label: 'Claude 3.5 Haiku' },
      { value: 'deepseek/deepseek-chat', label: 'DeepSeek Chat' },
    ],
  },
  {
    id: 'groq',
    label: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    keyHint: 'gsk_…',
    models: [
      { value: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B' },
      { value: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B', hint: 'سریع‌ترین' },
    ],
  },
  {
    id: 'self',
    label: 'مدل خودمیزبان',
    baseUrl: 'http://127.0.0.1:8000/v1',
    keyHint: 'اگر کلید ندارد: local',
    models: [
      { value: 'qwen2.5:7b', label: 'Qwen 2.5 7B (Ollama)' },
      { value: 'local-model', label: 'مدل سروشده در vLLM' },
    ],
  },
];

export const SETTINGS: SettingDef[] = [
  // ---------------------------------------------------------------- هوش مصنوعی
  {
    key: 'AI_ENABLED', group: 'ai', label: 'استفاده از مدل زبانی', kind: 'bool', fallback: 'false',
    hint: 'خاموش یعنی همه‌ی پاسخ‌ها از موتور قاعده‌محور و کاتالوگ می‌آید.',
  },
  {
    key: 'AI_BASE_URL', group: 'ai', label: 'آدرس درگاه مدل', kind: 'url',
    placeholder: 'https://api.openai.com/v1', fallback: 'https://api.openai.com/v1',
    hint: 'هر سرویسی که POST {آدرس}/chat/completions را استاندارد OpenAI جواب بدهد.',
  },
  {
    key: 'AI_MODEL', group: 'ai', label: 'نام مدل', kind: 'text', placeholder: 'gpt-4o-mini', fallback: 'gpt-4o-mini',
    hint: 'دقیقاً همان شناسه‌ای که ارائه‌دهنده در مستنداتش نوشته است.',
  },
  {
    key: 'AI_API_KEY', group: 'ai', label: 'کلید API', kind: 'secret', optional: true,
    placeholder: 'sk-…', hint: 'فقط یک‌بار ذخیره می‌شود و دیگر نمایش داده نمی‌شود. درگاه محلی بدون کلید: local',
  },
  { key: 'AI_TEMPERATURE', group: 'ai', label: 'خلاقیت (temperature)', kind: 'number', fallback: '0.3', min: 0, max: 2, hint: 'برای فروش، پایین (۰٫۲ تا ۰٫۴) بهتر است.' },
  { key: 'AI_MAX_OUTPUT_TOKENS', group: 'ai', label: 'سقف توکن پاسخ', kind: 'number', fallback: '400', min: 64, max: 4096 },
  { key: 'AI_TIMEOUT_MS', group: 'ai', label: 'سقف زمان انتظار (میلی‌ثانیه)', kind: 'number', fallback: '12000', min: 1000, max: 60000 },

  // -------------------------------------------------------------------- تلگرام
  {
    key: 'TELEGRAM_BOT_TOKEN', group: 'telegram', label: 'توکن بات', kind: 'secret', optional: true,
    placeholder: '123456789:AA…', hint: 'از BotFather. با تغییر آن، webhook باید دوباره ثبت شود.',
  },
  {
    key: 'TELEGRAM_WEBHOOK_SECRET', group: 'telegram', label: 'سکرت webhook', kind: 'secret', optional: true,
    hint: 'حداقل ۱۶ کاراکتر؛ بخش آخر مسیر webhook است. اگر عوض شود، تلگرام دیگر به آدرس قبلی وصل نیست.',
  },
  { key: 'TELEGRAM_API_BASE', group: 'telegram', label: 'آدرس Bot API', kind: 'url', fallback: 'https://api.telegram.org', hint: 'فقط برای تست یا درگاه واسط عوض کنید.' },
  { key: 'TELEGRAM_TIMEOUT_MS', group: 'telegram', label: 'سقف زمان انتظار (میلی‌ثانیه)', kind: 'number', fallback: '10000', min: 1000, max: 60000 },
  {
    key: 'PUBLIC_API_URL', group: 'telegram', label: 'آدرس عمومی API', kind: 'url', optional: true,
    placeholder: 'https://forooshyar-api.onrender.com',
    hint: 'برای ساختن نشانی webhook لازم است؛ اگر خالی باشد از هدرهای درخواست حدس زده می‌شود.',
  },

  // --------------------------------------------------------------------- پرداخت
  {
    key: 'ZARINPAL_MERCHANT_ID', group: 'payments', label: 'شناسه‌ی پذیرنده‌ی زرین‌پال', kind: 'secret', optional: true,
    hint: 'اگر خالی باشد، پرداخت در حالت «آزمایشی» انجام می‌شود و پولی جابه‌جا نمی‌شود.',
  },
  { key: 'ZARINPAL_API_BASE', group: 'payments', label: 'آدرس API زرین‌پال', kind: 'url', fallback: 'https://api.zarinpal.com' },

  // ------------------------------------------------------------------- دیتابیس
  {
    key: 'DATABASE_URL', group: 'database', label: 'آدرس اتصال PostgreSQL', kind: 'secret', optional: true, restart: true,
    placeholder: 'postgresql://user:pass@host:5432/db?schema=public',
    hint: 'اگر خالی باشد از متغیر محیطی سرور استفاده می‌شود. تغییرش تا ری‌استارت بعدی اثر ندارد.',
  },

  // --------------------------------------------------------------------- سیستم
  {
    key: 'CORS_ORIGINS', group: 'system', label: 'مبدأهای مجاز (CORS)', kind: 'text', optional: true, restart: true,
    placeholder: 'https://panel.example.com,https://admin.example.com',
    hint: 'با کاما جدا کنید؛ بدون مسیر و بدون اسلش انتهایی.',
  },
  { key: 'CACHE_ENABLED', group: 'system', label: 'کش توزیع‌شده', kind: 'bool', fallback: 'false', restart: true, hint: 'نیازمند REDIS_URL.' },
  { key: 'REDIS_URL', group: 'system', label: 'آدرس Redis', kind: 'secret', optional: true, restart: true, placeholder: 'redis://…' },
  { key: 'AUDIT_LOG_READS', group: 'system', label: 'ثبت درخواست‌های خواندنی در دفتر گردش', kind: 'bool', fallback: 'false', restart: true },
  { key: 'DEBUG_CLARIFY', group: 'system', label: 'لاگ عیب‌یابی مرحله‌ی «نفهمیدم»', kind: 'bool', fallback: 'false' },
];

export const SETTING_BY_KEY = new Map(SETTINGS.map(def => [def.key, def]));

/** کلیدهایی که مقدارشان رمزآلود است و در پاسخ خواندن ماسک می‌شوند. */
export function isSecret(def: SettingDef): boolean {
  return def.kind === 'secret';
}

/** اعتبارسنجی یک مقدار؛ پیام فارسی برمی‌گرداند یا null. */
export function validateValue(def: SettingDef, raw: string): string | null {
  const value = raw.trim();
  if (!value) return def.optional ? null : 'این فیلد نمی‌تواند خالی باشد.';
  switch (def.kind) {
    case 'bool':
      return /^(true|false)$/.test(value) ? null : 'مقدار باید true یا false باشد.';
    case 'number': {
      const number = Number(value);
      if (!Number.isFinite(number)) return 'مقدار باید عدد باشد.';
      if (def.min !== undefined && number < def.min) return `کمتر از ${def.min} مجاز نیست.`;
      if (def.max !== undefined && number > def.max) return `بیشتر از ${def.max} مجاز نیست.`;
      return null;
    }
    case 'url': {
      try {
        const url = new URL(value);
        if (!['http:', 'https:'].includes(url.protocol)) return 'آدرس باید با http:// یا https:// شروع شود.';
        return null;
      } catch { return 'آدرس معتبر نیست.'; }
    }
    case 'choice':
      return def.choices?.some(choice => choice.value === value) ? null : 'گزینه‌ی انتخاب‌شده در فهرست نیست.';
    case 'secret':
      if (def.key === 'DATABASE_URL' && !/^postgres(ql)?:\/\//.test(value)) return 'آدرس باید با postgresql:// شروع شود.';
      if (def.key === 'TELEGRAM_WEBHOOK_SECRET' && value.length < 16) return 'سکرت باید حداقل ۱۶ کاراکتر باشد.';
      return null;
    default:
      return null;
  }
}

/**
 * ماسک کردن مقدار حساس برای نمایش.
 *
 * عمداً فقط چند کاراکتر آخر می‌ماند: ادمین باید بتواند بفهمد «کدام کلید» است،
 * ولی نتواند آن را از روی صفحه کپی کند.
 */
export function mask(value: string): string {
  if (!value) return '';
  if (value.length <= 8) return '•'.repeat(value.length);
  return `${'•'.repeat(Math.min(18, value.length - 4))}${value.slice(-4)}`;
}

/** آدرسی که اعتبارنامه‌هایش پاک شده — برای نمایش در پنل. */
export function safeDatabaseLabel(url: string): { host: string; port: string; database: string; user: string; ssl: string; redacted: string } | null {
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname,
      port: parsed.port || '5432',
      database: parsed.pathname.replace(/^\//, '') || '',
      user: decodeURIComponent(parsed.username || ''),
      ssl: parsed.searchParams.get('sslmode') || 'prefer',
      redacted: `${parsed.protocol}//${parsed.username ? `${parsed.username}:***@` : ''}${parsed.host}${parsed.pathname}`,
    };
  } catch { return null; }
}
