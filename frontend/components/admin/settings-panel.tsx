'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { adminApi, AdminError, type SettingGroup, type SettingView, type SettingsPayload } from '@/lib/admin';
import { SkeletonRows, Spinner, Switch, useToast } from '@/components/ui';
import { IconAlertCircle, IconCheck, IconInfo, IconRefresh } from '@/components/icons';

export type PanelContext = {
  payload: SettingsPayload;
  draft: Record<string, string>;
  set: (key: string, value: string) => void;
};

const SOURCE_LABEL: Record<SettingView['source'], { text: string; cls: string }> = {
  db: { text: 'از پنل', cls: 't-db' },
  env: { text: 'از سرور', cls: 't-env' },
  default: { text: 'پیش‌فرض', cls: '' },
};

/**
 * فرم یک گروه تنظیمات.
 *
 * چرا عمومی و داده‌محور: فهرست فیلدها از API می‌آید (`settings.catalog.ts` سمت
 * سرور). پنل هیچ فیلدی را دستی نمی‌شناسد، پس اضافه‌کردن یک تنظیم تازه در
 * بک‌اند، بدون تغییر فرانت در پنل ظاهر می‌شود.
 */
export function SettingsPanel({
  group, renderExtra,
}: {
  group: SettingGroup['id'];
  renderExtra?: (context: PanelContext) => ReactNode;
}) {
  const toast = useToast();
  const [payload, setPayload] = useState<SettingsPayload | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const next = await adminApi.settings();
      setPayload(next);
      const view = next.groups.find(item => item.id === group);
      setDraft(Object.fromEntries((view?.settings ?? []).map(setting => [setting.key, setting.value])));
      setError('');
    } catch (problem) {
      setError(problem instanceof AdminError ? problem.message : 'دریافت تنظیمات انجام نشد.');
    }
  }, [group]);

  useEffect(() => { void load(); }, [load]);

  const view = payload?.groups.find(item => item.id === group) ?? null;
  const dirty = useMemo(() => {
    if (!view) return [];
    return view.settings.filter(setting => (draft[setting.key] ?? '') !== setting.value).map(setting => setting.key);
  }, [view, draft]);

  const set = (key: string, value: string) => setDraft(previous => ({ ...previous, [key]: value }));

  async function save() {
    if (!view || dirty.length === 0) return;
    setBusy(true);
    setError('');
    try {
      const values = Object.fromEntries(dirty.map(key => [key, draft[key] ?? '']));
      const result = await adminApi.save(values);
      setSavedAt(new Date().toISOString());
      toast.success(
        'ذخیره شد',
        result.saved.length ? `${result.saved.length} تنظیم به‌روزرسانی شد.` : 'مقدار ماسک‌شده بدون تغییر ماند.',
      );
      await load();
    } catch (problem) {
      const message = problem instanceof AdminError ? problem.message : 'ذخیره انجام نشد.';
      setError(message);
      toast.error('ذخیره نشد', message);
    } finally {
      setBusy(false);
    }
  }

  if (!payload) {
    return (
      <section className="card card-pad">
        {error ? (
          <div className="adm-note bad"><IconAlertCircle size={16} /><span>{error}</span></div>
        ) : (
          <SkeletonRows rows={5} />
        )}
      </section>
    );
  }

  if (!view) return <div className="adm-note">این گروه تنظیمات وجود ندارد.</div>;

  return (
    <>
      {view.id === 'database' && view.database && (
        <div className="adm-note">
          <IconInfo size={16} />
          <span>
            اتصال فعلی: <b className="ltr">{view.database.host}:{view.database.port}</b> · دیتابیس
            <b className="ltr"> {view.database.database}</b> · کاربر <b className="ltr">{view.database.user}</b> · SSL
            <b className="ltr"> {view.database.ssl}</b>
          </span>
        </div>
      )}

      {renderExtra?.({ payload, draft, set })}

      <section className="card adm-sec" style={{ overflow: 'hidden' }}>
        <div className="card-head">
          <div>
            <div className="card-title">{view.label}</div>
            <div className="card-desc">{view.description}</div>
          </div>
          <div className="adm-bar">
            <span className="adm-tag">{(view.settings.length).toLocaleString('fa-IR')} تنظیم</span>
            {dirty.length > 0 && <span className="adm-tag t-restart">{dirty.length.toLocaleString('fa-IR')} تغییر ذخیره‌نشده</span>}
          </div>
        </div>

        {error && (
          <div style={{ padding: '0 18px 12px' }}>
            <div className="adm-note bad"><IconAlertCircle size={16} /><span>{error}</span></div>
          </div>
        )}

        <div className="adm-form">
          {view.settings.map(setting => (
            <div key={setting.key} className={`adm-row${dirty.includes(setting.key) ? ' dirty' : ''}`}>
              <div>
                <div className="lbl">
                  {setting.label}
                  <span className={`adm-tag ${SOURCE_LABEL[setting.source].cls}`}>{SOURCE_LABEL[setting.source].text}</span>
                  {setting.restart && <span className="adm-tag t-restart">نیازمند ری‌استارت</span>}
                  {setting.optional && <span className="adm-tag">اختیاری</span>}
                </div>
                {setting.hint && <div className="hint">{setting.hint}</div>}
                <div className="hint" style={{ opacity: 0.7, fontFamily: 'var(--font-mono, monospace)', direction: 'ltr', textAlign: 'right', fontSize: 10.5 }}>
                  {setting.key}
                </div>
              </div>
              <div className="ctl">
                <Control setting={setting} value={draft[setting.key] ?? ''} onChange={next => set(setting.key, next)} />
                {setting.kind === 'secret' && (
                  <div className="row" style={{ gap: 6 }}>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => set(setting.key, '')}>
                      پاک‌کردن (بازگشت به مقدار سرور)
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {dirty.length > 0 ? (
        // داک فقط وقتی چیزی برای ذخیره هست ظاهر می‌شود؛ وگرنه روی فیلدها می‌افتد
        // و فرم را می‌پوشاند.
        <div className="adm-save-dock">
          <span className="txt">{dirty.length.toLocaleString('fa-IR')} تغییر آماده‌ی ذخیره است.</span>
          <div className="sp" />
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void load()} disabled={busy}>
            لغو تغییرات
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => void save()} disabled={busy}>
            {busy ? <Spinner size={14} /> : <IconCheck size={14} />}
            ذخیره تنظیمات
          </button>
        </div>
      ) : (
        <div className="adm-bar" style={{ marginTop: 4 }}>
          <span className="small muted">{savedAt ? 'همه‌چیز ذخیره شده است.' : 'تغییری نکرده است.'}</span>
          <div className="sp" />
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void load()} disabled={busy}>
            {busy ? <Spinner size={14} /> : <IconRefresh size={14} />}
            بازخوانی
          </button>
        </div>
      )}

      <div className="adm-note" style={{ marginTop: 12 }}>
        <IconInfo size={16} />
        <span>
          تنظیمات این صفحه در دیتابیس ذخیره می‌شود و بر متغیرهای محیطی سرور اولویت دارد؛
          پس بدون Deploy مجدد هم اثر می‌کند. برای غیرفعال‌کردن یک مقدار و برگشت به مقدار سرور، فیلد را خالی کنید
          {' '}— <Link href="/app/assistant" className="notif-link">آزمایش دستیار</Link> برای دیدن نتیجه‌ی مدل.
        </span>
      </div>
    </>
  );
}

function Control({ setting, value, onChange }: { setting: SettingView; value: string; onChange: (next: string) => void }) {
  if (setting.kind === 'bool') {
    return (
      <div className="row" style={{ gap: 10 }}>
        <Switch
          checked={value === 'true'}
          onChange={next => onChange(next ? 'true' : 'false')}
          label={`${setting.label} ${value === 'true' ? 'روشن' : 'خاموش'}`}
          id={`sw-${setting.key}`}
        />
        <span className="small muted">{value === 'true' ? 'روشن' : 'خاموش'}</span>
      </div>
    );
  }
  if (setting.kind === 'choice' && setting.choices) {
    return (
      <select className="select" value={value} onChange={event => onChange(event.target.value)} aria-label={setting.label}>
        {setting.choices.map(choice => (
          <option key={choice.value} value={choice.value}>{choice.label}</option>
        ))}
      </select>
    );
  }
  if (setting.kind === 'number') {
    return (
      <input
        className="input input-ltr" type="number" value={value} min={setting.min ?? undefined} max={setting.max ?? undefined}
        onChange={event => onChange(event.target.value)} aria-label={setting.label}
      />
    );
  }
  if (setting.kind === 'secret') {
    return (
      <input
        className="input input-ltr" type="text" value={value} spellCheck={false} autoComplete="off"
        placeholder={setting.placeholder ?? 'مقدار تازه را بچسبانید'}
        onChange={event => onChange(event.target.value)} aria-label={setting.label}
      />
    );
  }
  return (
    <input
      className={`input${setting.kind === 'url' ? ' input-ltr' : ''}`}
      type="text" value={value} spellCheck={false}
      placeholder={setting.placeholder ?? ''}
      onChange={event => onChange(event.target.value)} aria-label={setting.label}
    />
  );
}
