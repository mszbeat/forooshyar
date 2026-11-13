'use client';

import { useEffect, useState } from 'react';
import { plansAdminApi, type AdminPlan } from '@/lib/admin';
import { PageHeader, Spinner } from '@/components/ui';

/**
 * تنظیم پلن‌ها — نوار تب با نام پلن‌ها؛ با زدن روی هر نام، ویرایشگر همان
 * پلن زیر نوار باز می‌شود و با تعویض تب، محتوای ویرایشگر عوض می‌شود
 * (نه اینکه مودال جدید زیر مودال قبلی اضافه شود).
 */
export default function AdminPlansPage() {
  const [rows, setRows] = useState<AdminPlan[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const reload = () => plansAdminApi.list().then(data => {
    setRows(data);
    setActiveId(current => (current && data.some(r => r.id === current) ? current : (data[0]?.id ?? null)));
  }).catch(() => setError('فهرست پلن‌ها دریافت نشد.'));
  useEffect(() => { void reload(); }, []);

  const update = (id: string, key: keyof AdminPlan, value: string | number | boolean | string[]) =>
    setRows(old => old.map(r => r.id === id ? ({ ...r, [key]: value }) : r));

  async function save(row: AdminPlan) {
    setBusy(true); setError(''); setNotice('');
    try {
      await plansAdminApi.save(row);
      setNotice(`پلن «${row.name}» ذخیره شد.`);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ذخیره ناموفق بود.');
    } finally { setBusy(false); }
  }

  const active = rows.find(r => r.id === activeId) ?? null;

  return (
    <div className="stack">
      <PageHeader
        eyebrow="اشتراک و درآمد"
        title="تنظیم پلن‌ها"
        description="قیمت، امکانات و سقف‌ها همین‌جا تنظیم می‌شود و بی‌درنگ در صفحه‌ی قیمت‌گذاری دیده می‌شود. قیمت‌های فعلی نمونه‌اند."
      />
      <div className="alert alert-warn">پلن‌های غیرفعال برای خرید نمایش داده نمی‌شوند. شناسه (slug) در آدرس صفحه‌ی جزئیات استفاده می‌شود.</div>
      {error && <div className="alert alert-error">{error}</div>}
      {notice && <div className="alert alert-success">{notice}</div>}
      {rows.length === 0 && <button className="btn btn-outline" onClick={reload}>بارگذاری دوباره</button>}

      {rows.length > 0 && (
        <>
          {/* نوار تب پلن‌ها */}
          <div className="chip-tabs plan-tabs" role="tablist" aria-label="انتخاب پلن">
            {rows.map(row => (
              <button
                key={row.id}
                type="button"
                role="tab"
                aria-selected={row.id === activeId}
                className={`chip-btn ${row.id === activeId ? 'on' : ''}`}
                onClick={() => setActiveId(row.id)}
              >
                {row.name}
                {!row.active && <span className="small muted"> (غیرفعال)</span>}
              </button>
            ))}
          </div>

          {/* ویرایشگر پلن فعال — با تعویض تب، همین بخش به پلن جدید تغییر می‌کند */}
          {active && (
            <section className="card card-pad stack" key={active.id}>
              <div className="row-between">
                <strong>{active.name}</strong>
                <span className="mono small muted">/{active.slug}</span>
              </div>
              <label className="field">
                <span className="field-label">نام پلن</span>
                <input className="input" value={active.name} maxLength={80} onChange={e => update(active.id, 'name', e.target.value)} />
              </label>
              <label className="field">
                <span className="field-label">شناسه (slug)</span>
                <input className="input input-ltr" dir="ltr" value={active.slug} maxLength={60} onChange={e => update(active.id, 'slug', e.target.value)} />
              </label>
              <label className="field">
                <span className="field-label">یک‌خط وعده</span>
                <input className="input" value={active.tagline} maxLength={160} onChange={e => update(active.id, 'tagline', e.target.value)} />
              </label>
              <label className="field">
                <span className="field-label">امکانات (هر خط یک مورد)</span>
                <textarea
                  className="textarea"
                  rows={4}
                  value={(active.features ?? []).join('\n')}
                  onChange={e => update(active.id, 'features', e.target.value.split('\n').map(s => s.trim()).filter(Boolean))}
                />
              </label>
              <div className="grid g-2">
                <label className="field">
                  <span className="field-label">قیمت ماهانه (تومان)</span>
                  <input className="input input-ltr" type="number" min="0" value={active.monthlyPrice} onChange={e => update(active.id, 'monthlyPrice', Number(e.target.value))} />
                </label>
                <label className="field">
                  <span className="field-label">قیمت قبل از تخفیف (اختیاری)</span>
                  <input className="input input-ltr" type="number" min="0" value={active.listMonthlyPrice} onChange={e => update(active.id, 'listMonthlyPrice', Number(e.target.value))} />
                </label>
                <label className="field">
                  <span className="field-label">سقف اینستاگرام</span>
                  <input className="input input-ltr" type="number" min="0" value={active.instagramLimit} onChange={e => update(active.id, 'instagramLimit', Number(e.target.value))} />
                </label>
                <label className="field">
                  <span className="field-label">سقف تلگرام</span>
                  <input className="input input-ltr" type="number" min="0" value={active.telegramLimit} onChange={e => update(active.id, 'telegramLimit', Number(e.target.value))} />
                </label>
                <label className="field">
                  <span className="field-label">سقف پیام ماهانه (۰ = نامحدود)</span>
                  <input className="input input-ltr" type="number" min="0" value={active.monthlyMessageLimit} onChange={e => update(active.id, 'monthlyMessageLimit', Number(e.target.value))} />
                </label>
                <label className="field">
                  <span className="field-label">سقف محصول (۰ = نامحدود)</span>
                  <input className="input input-ltr" type="number" min="0" value={active.productLimit} onChange={e => update(active.id, 'productLimit', Number(e.target.value))} />
                </label>
                <label className="field">
                  <span className="field-label">قیمت ماهانه افزودنی پیامک سفارش (۰ = غیرقابل خرید)</span>
                  <input className="input input-ltr" type="number" min="0" value={active.orderSmsMonthlyPrice ?? 0} onChange={e => update(active.id, 'orderSmsMonthlyPrice', Number(e.target.value))} />
                </label>
              </div>
              <div className="row">
                <label className="row"><input type="checkbox" checked={active.active} onChange={e => update(active.id, 'active', e.target.checked)} /><span>نمایش و فروش فعال</span></label>
                <label className="row"><input type="checkbox" checked={active.isPopular} onChange={e => update(active.id, 'isPopular', e.target.checked)} /><span>پلن محبوب</span></label>
                <label className="row"><input type="checkbox" checked={active.orderSmsIncluded ?? false} onChange={e => update(active.id, 'orderSmsIncluded', e.target.checked)} /><span>پیامک سفارش گنجانده شده</span></label>
              </div>
              <button className="btn btn-primary" disabled={busy} onClick={() => void save(active)}>
                {busy ? <Spinner size={15} /> : null}ذخیره پلن
              </button>
            </section>
          )}
        </>
      )}
    </div>
  );
}
