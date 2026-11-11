'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { request, tokenStore } from '@/lib/api';
import { IconCheckCircle, IconArrowLeft } from '@/components/icons';

type Plan = { id: string; name: string; monthlyPrice: number; instagramLimit: number; telegramLimit: number };
const toman = (n: number) => `${n.toLocaleString('fa-IR')} تومان`;
export default function PlansPage() {
  const [plans, setPlans] = useState<Plan[]>([]); const [months, setMonths] = useState(1); const [busy, setBusy] = useState(''); const [error, setError] = useState('');
  useEffect(() => { request<Plan[]>('/subscriptions/plans', { auth: false }).then(setPlans).catch(() => setError('دریافت پلن‌ها ممکن نشد.')); }, []);
  const total = (price: number) => price * months;
  async function buy(plan: Plan) { if (!tokenStore.get()) { window.location.href = `/login?next=${encodeURIComponent('/plans')}`; return; } setBusy(plan.id); setError(''); try { const r = await request<{ url: string }>('/subscriptions/checkout', { method: 'POST', body: { planId: plan.id, months } }); window.location.assign(r.url); } catch (e) { setError(e instanceof Error ? e.message : 'شروع پرداخت ممکن نشد.'); setBusy(''); } }
  return <main className="container stack" style={{ paddingBlock: 64, maxWidth: 1120 }}>
    <Link href="/" className="btn btn-ghost" style={{ justifySelf: 'start' }}><IconArrowLeft size={16}/> بازگشت</Link>
    <header style={{ textAlign: 'center' }}><p className="eyebrow">اشتراک فروش‌یار</p><h1>پلنی متناسب با تعداد فروشگاه‌هایتان انتخاب کنید</h1><p className="muted">هر پلن، سقف Instagram و Telegram جداگانه دارد.</p></header>
    <section className="card card-pad stack" style={{ maxWidth: 650, marginInline: 'auto', width: '100%' }}><h2>شروع رایگان</h2><p>۶ روز آزمایش رایگان با حداکثر ۱ اتصال Instagram و ۱ اتصال Telegram. پس از پایان دوره، پاسخ‌گویی متوقف می‌شود و اطلاعاتتان حفظ می‌ماند.</p><Link className="btn btn-outline" href="/login">ورود یا ساخت حساب</Link></section>
    <section className="card card-pad stack" style={{ maxWidth: 650, marginInline: 'auto', width: '100%' }}><label htmlFor="months">مدت اشتراک: <b>{months.toLocaleString('fa-IR')} ماه</b></label><input id="months" type="range" min="1" max="18" value={months} onChange={e => setMonths(Number(e.target.value))}/><div className="row-between small muted"><span>۱ ماه</span><span>۱۸ ماه</span></div></section>
    {error && <div className="alert alert-error">{error}</div>}
    {plans.length === 0 && !error && <p className="muted" style={{ textAlign: 'center' }}>پلن‌ها به‌زودی در دسترس قرار می‌گیرند.</p>}
    <div className="grid g-3">{plans.map((p, i) => <article className="card card-pad stack" key={p.id}><div className="row-between"><h2>{p.name}</h2>{i === 1 ? <span className="badge b-green">محبوب</span> : null}</div><div><b className="num" style={{ fontSize: 24 }}>{toman(p.monthlyPrice)}</b><span className="muted"> / ماه</span></div><div className="kv"><div className="kv-row"><span className="kv-k">Instagram</span><span className="kv-v">تا {p.instagramLimit} فروشگاه</span></div><div className="kv-row"><span className="kv-k">Telegram</span><span className="kv-v">تا {p.telegramLimit} فروشگاه</span></div><div className="kv-row"><span className="kv-k">مدت انتخابی</span><span className="kv-v">{months.toLocaleString('fa-IR')} ماه</span></div></div><div className="row-between"><span>جمع کل</span><b className="num">{toman(total(p.monthlyPrice))}</b></div><button className="btn btn-primary" disabled={busy !== '' || p.monthlyPrice <= 0} onClick={() => void buy(p)}>{busy === p.id ? 'در حال انتقال…' : <><IconCheckCircle size={16}/> انتخاب پلن و پرداخت</>}</button></article>)}</div>
    <p className="small muted" style={{ textAlign: 'center' }}>با پایان دورهٔ آزمایشی ۶روزه یا اشتراک، پاسخ‌گویی بات متوقف می‌شود؛ اطلاعات فروشگاه حذف نمی‌شود.</p>
  </main>;
}
