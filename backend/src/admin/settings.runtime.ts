import { SETTING_BY_KEY } from './settings.catalog';

/**
 * اعمال تنظیمات ذخیره‌شده‌ی پنل ادمین روی `process.env`.
 *
 * چرا روی env و نه یک لایه‌ی پیکربندی اختصاصی: کل برنامه (AiService،
 * TelegramClient، loadConfig، AuditService، CacheService) از `process.env`
 * می‌خواند. اگر تنظیمات را جای دیگری نگه داریم، باید همه‌ی آن‌ها را بازنویسی
 * کنیم و هر کدام می‌تواند یک جای دیگر جا بیفتد. این‌جا یک نقطه‌ی واحد داریم:
 * مقدار ذخیره‌شده env را «می‌پوشاند».
 *
 * اولویت: دیتابیس ← env ← پیش‌فرض کد. مقدار خالی در دیتابیس یعنی «دست نزن»،
 * تا خالی‌کردن یک فیلد در پنل، متغیر محیطی سرور را از بین نبرد.
 */
export type SettingRow = { key: string; value: string };

export function applyOverrides(rows: SettingRow[], env: NodeJS.ProcessEnv = process.env): { applied: string[]; ignored: string[] } {
  const applied: string[] = [];
  const ignored: string[] = [];
  for (const row of rows) {
    const def = SETTING_BY_KEY.get(row.key);
    if (!def) { ignored.push(row.key); continue; }
    const value = (row.value ?? '').trim();
    if (!value) continue;
    env[row.key] = value;
    applied.push(row.key);
  }
  return { applied, ignored };
}

/** true/false را به شکل استاندارد درمی‌آورد؛ بقیه‌ی مقادیر دست‌نخورده می‌مانند. */
export function normalizeValue(key: string, raw: string): string {
  const value = raw.trim();
  const def = SETTING_BY_KEY.get(key);
  if (def?.kind === 'bool') return /^(1|true|yes|on)$/i.test(value) ? 'true' : 'false';
  return value;
}
