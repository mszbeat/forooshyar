'use client';

import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { adminApi, type ManagedShop } from '@/lib/admin';
import { PageHeader, Spinner, useToast } from '@/components/ui';
import { faNum } from '@/lib/format';
import { IconAlertCircle, IconCheckCircle, IconEdit, IconPlus, IconRefresh, IconSearch, IconStore, IconTrash, IconX } from '@/components/icons';

type FormState = { name: string; email: string; password: string };
const EMPTY: FormState = { name: '', email: '', password: '' };

export default function AdminShopsPage() {
  const toast = useToast();
  const [shops, setShops] = useState<ManagedShop[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ManagedShop | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);

  async function load() {
    setLoading(true);
    try { setShops(await adminApi.shops()); setError(''); }
    catch (problem) { setError(problem instanceof Error ? problem.message : 'فهرست فروشگاه‌ها دریافت نشد.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  const counts = useMemo(() => ({
    total: shops.length,
    active: shops.filter(shop => shop.active).length,
    inactive: shops.filter(shop => !shop.active).length,
  }), [shops]);
  const visible = useMemo(() => shops.filter(shop => {
    const matchStatus = status === 'all' || shop.active === (status === 'active');
    const needle = query.trim().toLocaleLowerCase();
    return matchStatus && (!needle || `${shop.name} ${shop.email}`.toLocaleLowerCase().includes(needle));
  }), [shops, status, query]);

  function openCreate() {
    setEditing(null); setForm(EMPTY); setFormOpen(true); setError('');
  }
  function openEdit(shop: ManagedShop) {
    setEditing(shop); setForm({ name: shop.name, email: shop.email, password: '' }); setFormOpen(true); setError('');
  }
  function closeForm() { setFormOpen(false); setEditing(null); setForm(EMPTY); }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError('');
    try {
      if (editing) {
        await adminApi.updateShop(editing.id, {
          name: form.name.trim(), email: form.email.trim(),
          ...(form.password ? { password: form.password } : {}),
        });
        toast.success('اطلاعات به‌روز شد', `تغییرات فروشگاه «${form.name.trim()}» ذخیره شد.`);
      } else {
        await adminApi.createShop({ name: form.name.trim(), email: form.email.trim(), password: form.password });
        toast.success('فروشگاه ساخته شد', 'حساب مالک و فروشگاه با هم ایجاد شدند.');
      }
      closeForm(); await load();
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'ذخیرهٔ فروشگاه انجام نشد.');
    } finally { setBusy(false); }
  }

  async function toggleActive(shop: ManagedShop) {
    setBusy(true); setError('');
    try {
      await adminApi.updateShop(shop.id, { active: !shop.active });
      toast.success(shop.active ? 'فروشگاه غیرفعال شد' : 'فروشگاه فعال شد', shop.active
        ? 'ورود مالک و دسترسی پنل فروشنده متوقف شد؛ اطلاعات فروشگاه حفظ شد.'
        : 'دسترسی مالک و پنل فروشنده دوباره برقرار شد.');
      await load();
    } catch (problem) { setError(problem instanceof Error ? problem.message : 'تغییر وضعیت انجام نشد.'); }
    finally { setBusy(false); }
  }

  async function remove(shop: ManagedShop) {
    const accepted = window.confirm(`حذف دائمی «${shop.name}» و همهٔ محصولات، سفارش‌ها، گفتگوها و گردش‌های موجودی وابسته؟ این کار برگشت‌پذیر نیست.`);
    if (!accepted) return;
    if (window.prompt(`برای تأیید حذف، نام فروشگاه را دقیق وارد کنید: ${shop.name}`) !== shop.name) {
      toast.error('حذف لغو شد', 'نام فروشگاه دقیقاً وارد نشد.');
      return;
    }
    setBusy(true); setError('');
    try {
      await adminApi.deleteShop(shop.id);
      toast.success('فروشگاه حذف شد', `«${shop.name}» و داده‌های وابسته حذف شدند. سوابق ممیزی سامانه حفظ می‌شوند.`);
      await load();
    } catch (problem) { setError(problem instanceof Error ? problem.message : 'حذف فروشگاه انجام نشد.'); }
    finally { setBusy(false); }
  }

  return (
    <div className="stack">
      <PageHeader
        eyebrow="ACCOUNTS · SHOPS"
        title="مدیریت فروشگاه‌ها"
        description="ساخت و ویرایش حساب‌های فروشنده، توقف موقت دسترسی یا حذف دائمی داده‌های وابسته."
        actions={<button type="button" className="btn btn-primary btn-sm" onClick={openCreate}><IconPlus size={15} />فروشگاه جدید</button>}
      />

      <div className="adm-kpis">
        <div className="adm-kpi"><span className="lb">همهٔ فروشگاه‌ها</span><span className="vl num">{faNum(counts.total)}</span><span className="ft">accounts</span></div>
        <div className="adm-kpi k-ok"><span className="lb">فعال</span><span className="vl num">{faNum(counts.active)}</span><span className="ft">قابل‌ورود</span></div>
        <div className="adm-kpi k-warn"><span className="lb">غیرفعال</span><span className="vl num">{faNum(counts.inactive)}</span><span className="ft">اطلاعات حفظ شده</span></div>
      </div>

      {error && <div className="adm-note bad"><IconAlertCircle size={16} /><span>{error}</span></div>}

      {formOpen && (
        <section className="card adm-sec" aria-label={editing ? 'ویرایش فروشگاه' : 'ساخت فروشگاه'}>
          <div className="card-head">
            <div><div className="card-title">{editing ? 'ویرایش فروشگاه' : 'ساخت فروشگاه و حساب مالک'}</div><div className="card-desc">ایمیل برای ورود مالک استفاده می‌شود؛ رمز حداقل ۱۰ نویسه باشد.</div></div>
            <button className="btn btn-ghost btn-icon btn-sm" onClick={closeForm} aria-label="بستن فرم"><IconX size={15}/></button>
          </div>
          <form onSubmit={event => void submit(event)} className="shop-admin-form">
            <label className="field"><span>نام فروشگاه</span><input className="input" required minLength={2} maxLength={200} value={form.name} onChange={event => setForm(prev => ({ ...prev, name: event.target.value }))} /></label>
            <label className="field"><span>ایمیل مالک</span><input className="input input-ltr" type="email" required maxLength={200} dir="ltr" value={form.email} onChange={event => setForm(prev => ({ ...prev, email: event.target.value }))} /></label>
            <label className="field"><span>{editing ? 'رمز تازهٔ مالک (اختیاری)' : 'رمز اولیهٔ مالک'}</span><input className="input input-ltr" type="password" required={!editing} minLength={10} maxLength={200} autoComplete="new-password" dir="ltr" value={form.password} onChange={event => setForm(prev => ({ ...prev, password: event.target.value }))} placeholder={editing ? 'برای نگه‌داشتن رمز فعلی خالی بگذارید' : 'حداقل ۱۰ نویسه'} /></label>
            <div className="row shop-admin-form-actions">
              <button type="button" className="btn btn-ghost" onClick={closeForm}>انصراف</button>
              <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? <Spinner size={14}/> : <IconCheckCircle size={15}/>} {editing ? 'ذخیرهٔ تغییرات' : 'ساخت فروشگاه'}</button>
            </div>
          </form>
        </section>
      )}

      <section className="card adm-sec">
        <div className="card-head shop-list-tools">
          <div><div className="card-title">فهرست فروشگاه‌ها</div><div className="card-desc">{faNum(visible.length)} مورد از {faNum(shops.length)}</div></div>
          <div className="shop-filters">
            <div className="shop-search"><IconSearch size={15}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="جستجوی نام یا ایمیل" aria-label="جستجوی فروشگاه" /></div>
            <div className="chart-switch" role="group" aria-label="فیلتر وضعیت">
              <button className={status === 'all' ? 'on' : ''} aria-pressed={status === 'all'} onClick={() => setStatus('all')}>همه</button>
              <button className={status === 'active' ? 'on' : ''} aria-pressed={status === 'active'} onClick={() => setStatus('active')}>فعال</button>
              <button className={status === 'inactive' ? 'on' : ''} aria-pressed={status === 'inactive'} onClick={() => setStatus('inactive')}>غیرفعال</button>
            </div>
            <button className="btn btn-ghost btn-icon btn-sm" type="button" onClick={() => void load()} disabled={loading} aria-label="بازخوانی"><IconRefresh size={14}/></button>
          </div>
        </div>
        {loading ? <div className="card-body"><div className="small muted">در حال دریافت فهرست…</div></div> : visible.length === 0 ? (
          <div className="empty-state"><IconStore size={22}/><strong>{shops.length ? 'فروشگاهی مطابق فیلتر نیست' : 'هنوز فروشگاهی ثبت نشده'}</strong><span>با دکمهٔ «فروشگاه جدید» حساب فروشنده بسازید.</span></div>
        ) : (
          <div className="table-wrap shop-table-wrap">
            <table className="table shop-table">
              <thead><tr><th>فروشگاه</th><th>حساب مالک</th><th>وضعیت</th><th>محصول</th><th>سفارش</th><th>تاریخ ساخت</th><th>عملیات</th></tr></thead>
              <tbody>{visible.map(shop => (
                <tr key={shop.id}>
                  <td><strong>{shop.name}</strong></td>
                  <td><span className="ltr" dir="ltr">{shop.email}</span></td>
                  <td><span className={`badge ${shop.active ? 'b-green' : 'b-amber'}`}><i className="dot"/>{shop.active ? 'فعال' : 'غیرفعال'}</span></td>
                  <td className="td-num">{faNum(shop.products)}</td><td className="td-num">{faNum(shop.orders)}</td>
                  <td>{new Date(shop.createdAt).toLocaleDateString('fa-IR')}</td>
                  <td><div className="row shop-row-actions">
                    <button className="btn btn-outline btn-sm" onClick={() => openEdit(shop)} disabled={busy}><IconEdit size={13}/>ویرایش</button>
                    <button className={`btn btn-sm ${shop.active ? 'btn-warn' : 'btn-soft'}`} onClick={() => void toggleActive(shop)} disabled={busy}>{shop.active ? 'غیرفعال‌سازی' : 'فعال‌سازی'}</button>
                    <button className="btn btn-ghost btn-icon btn-sm" style={{color:'var(--danger)'}} onClick={() => void remove(shop)} disabled={busy} title="حذف دائمی" aria-label={`حذف دائمی ${shop.name}`}><IconTrash size={14}/></button>
                  </div></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
        <div className="card-foot small muted">غیرفعال‌سازی دسترسی پنل فروشنده را می‌بندد و اطلاعات را نگه می‌دارد. حذف دائمی با تأیید نام فروشگاه، داده‌های وابسته را پاک می‌کند.</div>
      </section>
    </div>
  );
}
