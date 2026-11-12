'use client';

import { useEffect, useState } from 'react';
import { plansAdminApi, type AdminPlan } from '@/lib/admin';
import { PageHeader, Spinner } from '@/components/ui';

export default function AdminPlansPage() {
  const [rows, setRows] = useState<AdminPlan[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const reload = () => plansAdminApi.list().then(setRows).catch(() => setError('فهرست پلن‌ها دریافت نشد.'));
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
      <div className="grid g-2">
        {rows.map(row => (
          <section className="card card-pad stack" key={row.id}>
            <div className="row-between">
              <strong>{row.name}</strong>
              <span className="mono small muted">/{row.slug}</span>
            </div>
            <label className="field">
              <span className="field-label">نام پلن</span>
              <input className="input" value={row.name} maxLength={80} onChange={e => update(row.id, 'name', e.target.value)} />
            </label>
            <label className="field">
              <span className="field-label">شناسه (slug)</span>
              <input className="input input-ltr" dir="ltr" value={row.slug} maxLength={60} onChange={e => update(row.id, 'slug', e.target.value)} />
            </label>
            <label className="field">
              <span className="field-label">یک‌خط وعده</span>
              <input className="input" value={row.tagline} maxLength={160} onChange={e => update(row.id, 'tagline', e.target.value)} />
            </label>
            <label className="field">
              <span className="field-label">امکانات (هر خط یک مورد)</span>
              <textarea
                className="textarea"
                rows={4}
                value={(row.features ?? []).join('\n')}
                onChange={e => update(row.id, 'features', e.target.value.split('\n').map(s => s.trim()).filter(Boolean))}
              />
            </label>
            <div className="grid g-2">
              <label className="field">
                <span className="field-label">قیمت ماهانه (تومان)</span>
                <input className="input input-ltr" type="number" min="0" value={row.monthlyPrice} onChange={e => update(row.id, 'monthlyPrice', Number(e.target.value))} />
              </label>
              <label className="field">
                <span className="field-label">قیمت قبل از تخفیف (اختیاری)</span>
                <input className="input input-ltr" type="number" min="0" value={row.listMonthlyPrice} onChange={e => update(row.id, 'listMonthlyPrice', Number(e.target.value))} />
              </label>
              <label className="field">
                <span className="field-label">سقف اینستاگرام</span>
                <input className="input input-ltr" type="number" min="0" value={row.instagramLimit} onChange={e => update(row.id, 'instagramLimit', Number(e.target.value))} />
              </label>
              <label className="field">
                <span className="field-label">سقف تلگرام</span>
                <input className="input input-ltr" type="number" min="0" value={row.telegramLimit} onChange={e => update(row.id, 'telegramLimit', Number(e.target.value))} />
              </label>
              <label className="field">
                <span className="field-label">سقف پیام ماهانه (۰ = نامحدود)</span>
                <input className="input input-ltr" type="number" min="0" value={row.monthlyMessageLimit} onChange={e => update(row.id, 'monthlyMessageLimit', Number(e.target.value))} />
              </label>
              <label className="field">
                <span className="field-label">سقف محصول (۰ = نامحدود)</span>
                <input className="input input-ltr" type="number" min="0" value={row.productLimit} onChange={e => update(row.id, 'productLimit', Number(e.target.value))} />
              </label>
            </div>
            <div className="row">
              <label className="row"><input type="checkbox" checked={row.active} onChange={e => update(row.id, 'active', e.target.checked)} /><span>نمایش و فروش فعال</span></label>
              <label className="row"><input type="checkbox" checked={row.isPopular} onChange={e => update(row.id, 'isPopular', e.target.checked)} /><span>پلن محبوب</span></label>
            </div>
            <button className="btn btn-primary" disabled={busy} onClick={() => void save(row)}>
              {busy ? <Spinner size={15} /> : null}ذخیره پلن
            </button>
          </section>
        ))}
      </div>
    </div>
  );
}
