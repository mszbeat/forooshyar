import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../logging/audit.service';
import {
  AI_PROVIDERS, GROUPS, mask, safeDatabaseLabel, SETTING_BY_KEY, SETTINGS, validateValue,
  type SettingDef, type SettingGroup,
} from './settings.catalog';
import { applyOverrides, normalizeValue } from './settings.runtime';
import { RuntimeService } from './runtime.service';

export type SettingView = {
  key: string;
  group: SettingGroup;
  label: string;
  kind: SettingDef['kind'];
  hint: string | null;
  placeholder: string | null;
  optional: boolean;
  restart: boolean;
  choices: SettingDef['choices'] | null;
  min: number | null;
  max: number | null;
  /** مقدار قابل نمایش؛ برای مقادیر حساس ماسک‌شده است. */
  value: string;
  hasValue: boolean;
  /** db = از پنل ذخیره شده، env = از متغیر محیطی سرور، default = پیش‌فرض کد */
  source: 'db' | 'env' | 'default';
  updatedAt: string | null;
};

@Injectable()
export class SettingsService implements OnModuleInit {
  private readonly logger = new Logger('Settings');
  /** مقادیر env در لحظه‌ی بالا آمدن، برای تشخیص «نیاز به ری‌استارت». */
  private readonly bootEnv = new Map<string, string | undefined>();

  constructor(
    private readonly db: PrismaService,
    private readonly audit: AuditService,
    private readonly runtime: RuntimeService,
  ) {}

  async onModuleInit() {
    for (const def of SETTINGS) this.bootEnv.set(def.key, process.env[def.key]);
    try {
      const rows = await this.db.appSetting.findMany({ select: { key: true, value: true } });
      const { applied, ignored } = applyOverrides(rows);
      if (applied.length) this.logger.log(`تنظیمات پنل ادمین اعمال شد: ${applied.join('، ')}`);
      if (ignored.length) this.logger.warn(`کلید تنظیمات ناشناخته نادیده گرفته شد: ${ignored.join('، ')}`);
    } catch (error) {
      // نبودِ جدول (مثلاً پیش از migrate) نباید بالا آمدن سرویس را متوقف کند.
      this.logger.warn(`خواندن تنظیمات پنل ادمین انجام نشد: ${error instanceof Error ? error.message : 'unknown'}`);
    }
  }

  /** مقدار مؤثر (env پس از اعمال تنظیمات). */
  effective(key: string): string {
    return (process.env[key] ?? '').trim();
  }

  async list(): Promise<{ groups: unknown[]; providers: unknown; restartRequired: string[] }> {
    const rows = await this.db.appSetting.findMany().catch(() => []);
    const stored = new Map(rows.map(row => [row.key, row]));
    const values: SettingView[] = SETTINGS.map(def => {
      const row = stored.get(def.key);
      const raw = row?.value?.trim() || '';
      const fromEnv = (this.bootEnv.get(def.key) ?? '').trim();
      const value = raw || fromEnv || def.fallback || '';
      const source: SettingView['source'] = row?.value?.trim() ? 'db' : fromEnv ? 'env' : 'default';
      return {
        key: def.key,
        group: def.group,
        label: def.label,
        kind: def.kind,
        hint: def.hint ?? null,
        placeholder: def.placeholder ?? null,
        optional: Boolean(def.optional),
        restart: Boolean(def.restart),
        choices: def.choices ?? null,
        min: def.min ?? null,
        max: def.max ?? null,
        value: def.kind === 'secret' ? mask(value) : value,
        hasValue: Boolean(value),
        source,
        updatedAt: row?.updatedAt ? row.updatedAt.toISOString() : null,
      };
    });

    return {
      groups: GROUPS.map(group => ({
        ...group,
        database: group.id === 'database' ? safeDatabaseLabel(this.databaseUrl()) : null,
        settings: values.filter(setting => setting.group === group.id),
      })),
      providers: AI_PROVIDERS,
      restartRequired: this.restartRequired(stored),
    };
  }

  /**
   * ذخیره‌ی گروهی تنظیمات.
   *
   * قواعد:
   *  - کلید ناشناخته → ۴۰۰ (نه ذخیره‌ی خاموش).
   *  - مقدار حساسِ ماسک‌شده که بدون تغییر برگشته → نادیده گرفته می‌شود، وگرنه
   *    ذخیره‌ی یک فرم، کلید واقعی را با `••••1234` جایگزین می‌کرد.
   *  - خالی‌فرستادن یک فیلد غیراختیاری → ۴۰۰ با پیام فارسی.
   *  - کلیدهای `restart` بلافاصله اعمال می‌شوند ولی اثر واقعی‌شان بعد از
   *    ری‌استارت است؛ پنل هم همین را نشان می‌دهد.
   */
  async save(input: Record<string, string>, actor: { id: string; email: string }): Promise<{ saved: string[]; skipped: string[]; restartRequired: string[]; appliedLive: string[] }> {
    const entries = Object.entries(input);
    if (entries.length === 0) throw new BadRequestException('هیچ تنظیمی ارسال نشد.');

    const prepared: { def: SettingDef; value: string }[] = [];
    const errors: string[] = [];

    for (const [key, raw] of entries) {
      const def = SETTING_BY_KEY.get(key);
      if (!def) { errors.push(`کلید ناشناخته: ${key}`); continue; }
      const supplied = typeof raw === 'string' ? raw : '';
      // مقدار ماسک‌شده یعنی «تغییر نده» (فرم، مقدار قبلی را همان‌طور برگردانده)
      if (def.kind === 'secret' && supplied.includes('•')) continue;
      const value = normalizeValue(key, supplied);
      const problem = validateValue(def, value);
      if (problem) { errors.push(`${def.label}: ${problem}`); continue; }
      prepared.push({ def, value });
    }

    if (errors.length) throw new BadRequestException(errors.join(' | '));
    if (prepared.length === 0) return { saved: [], skipped: entries.map(([key]) => key), restartRequired: [], appliedLive: [] };

    await this.db.$transaction(
      prepared.map(({ def, value }) =>
        this.db.appSetting.upsert({
          where: { key: def.key },
          create: { key: def.key, value, secret: def.kind === 'secret', updatedBy: actor.id },
          update: { value, secret: def.kind === 'secret', updatedBy: actor.id },
        }),
      ),
    );

    applyOverrides(prepared.map(({ def, value }) => ({ key: def.key, value })));
    // اعمال فوری: اتصال‌های وابسته (کش) همین‌جا از نو ساخته می‌شوند.
    this.runtime.apply(prepared.map(({ def }) => def.key));
    // برنامه‌ی کلیدهایی که مقدارشان از لحظه‌ی بوت عوض شده و اتصال از پیش ساخته شده است
    for (const { def, value } of prepared) {
      if (!def.restart) continue;
      if ((this.bootEnv.get(def.key) ?? '').trim() !== value) this.bootEnv.set(def.key, value);
    }

    this.audit.record({
      action: 'admin.settings_update',
      entity: 'settings',
      entityId: 'platform',
      meta: { actor: actor.email, keys: prepared.map(entry => entry.def.key) },
    });

    const applied = this.runtime.apply(prepared.map(entry => entry.def.key));
    return {
      saved: prepared.map(entry => entry.def.key),
      skipped: [],
      restartRequired: this.restartRequired(),
      appliedLive: applied.hot,
    };
  }

  /** کلیدهای نیازمند ری‌استارت که مقدارشان با لحظه‌ی بوت فرق کرده است. */
  restartRequired(stored?: Map<string, { value: string }>): string[] {
    const keys: string[] = [];
    for (const def of SETTINGS) {
      if (!def.restart) continue;
      // فقط مقدار ذخیره‌شده معنا دارد؛ خالی‌بودن یعنی «همان env سرور».
      const current = stored ? (stored.get(def.key)?.value ?? '').trim() : '';
      if (!current) continue;
      const boot = (this.bootEnv.get(def.key) ?? '').trim();
      if (current !== boot) keys.push(def.key);
    }
    return keys;
  }

  databaseUrl(): string {
    if (this.effective('DATABASE_URL')) return this.effective('DATABASE_URL');
    const fields = ['DB_HOST', 'DB_PORT', 'DB_USERNAME', 'DB_PASSWORD', 'DB_NAME'];
    if (fields.every(field => process.env[field])) {
      const port = process.env.DB_PORT ?? '5432';
      return `postgresql://${process.env.DB_USERNAME}:${encodeURIComponent(process.env.DB_PASSWORD ?? '')}@${process.env.DB_HOST}:${port}/${process.env.DB_NAME}?schema=public`;
    }
    return process.env.DATABASE_URL ?? '';
  }
}
