'use client';
import { useEffect, useState } from 'react';
import { plansAdminApi, type AdminPlan } from '@/lib/admin';
import { PageHeader, Spinner } from '@/components/ui';

const DEFAULTS = [1, 3, 10];
export default function AdminPlansPage() {
  const [rows, setRows] = useState<AdminPlan[]>([]); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const reload = () => plansAdminApi.list().then(setRows).catch(() => setError('فهرست پلن‌ها دریافت نشد.'));
  useEffect(() => { void reload(); }, []);
  const update = (id: string, key: keyof AdminPlan, value: string | number | boolean) => setRows(old => old.map(r => r.id === id ? ({ ...r, [key]: value }) : r));
  async function save(row: AdminPlan) { setBusy(true); setError(''); setNotice(''); try { await plansAdminApi.save(row); setNotice(`پلن «${row.name}» ذخیره شد.`); await reload(); } catch (e) { setError(e instanceof Error ? e.message : 'ذخیره ناموفق بود.'); } finally { setBusy(false); } }
  return <div className="stack"><PageHeader eyebrow="اشتراک و درآمد" title="تنظیم پلن‌ها" description="نام و مبلغ ماهانه در این پنل قابل تنظیم است. سقف اتصال برای Instagram و Telegram جداگانه نشان داده می‌شود." />
    <div className="alert alert-warn">پلن‌های پیش‌فرض تا وقتی قیمت و نام را تنظیم و فعال نکنید، برای خرید نمایش داده نمی‌شوند.</div>
    {error && <div className="alert alert-error">{error}</div>}{notice && <div className="alert alert-success">{notice}</div>}
    {rows.length === 0 && <button className="btn btn-outline" onClick={reload}>بارگذاری دوباره</button>}
    <div className="grid g-3">{rows.map((r, i) => <section className="card card-pad stack" key={r.id}>
      <label className="field"><span className="field-label">نام پلن</span><input className="input" value={r.name} maxLength={80} onChange={e => update(r.id, 'name', e.target.value)} /></label>
      <label className="field"><span className="field-label">قیمت ماهانه (تومان)</span><input className="input input-ltr" type="number" min="0" value={r.monthlyPrice} onChange={e => update(r.id, 'monthlyPrice', Number(e.target.value))} /></label>
      <div className="kv"><div className="kv-row"><span className="kv-k">Instagram</span><span className="kv-v">{DEFAULTS[i] ?? r.instagramLimit} فروشگاه</span></div><div className="kv-row"><span className="kv-k">Telegram</span><span className="kv-v">{DEFAULTS[i] ?? r.telegramLimit} فروشگاه</span></div></div>
      <label className="row"><input type="checkbox" checked={r.active} onChange={e => update(r.id, 'active', e.target.checked)} /><span>نمایش و فروش فعال</span></label>
      <button className="btn btn-primary" disabled={busy} onClick={() => void save({ ...r, instagramLimit: DEFAULTS[i] ?? r.instagramLimit, telegramLimit: DEFAULTS[i] ?? r.telegramLimit })}>{busy ? <Spinner size={15} /> : null}ذخیره پلن</button>
    </section>)}</div>
  </div>;
}
