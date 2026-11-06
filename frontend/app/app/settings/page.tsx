'use client';

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { api, ApiError, type Shop } from '@/lib/api';
import { Field, PageHeader, SkeletonBlock, Spinner, useToast } from '@/components/ui';
import { IconAlertCircle, IconCheckCircle, IconChat, IconSettings, IconStore } from '@/components/icons';

type Form = Pick<Shop, 'name' | 'tone' | 'shipping' | 'payment' | 'workingHours' | 'handoffMessage'>;
const EMPTY: Form = { name: '', tone: '', shipping: '', payment: '', workingHours: '', handoffMessage: '' };

export default function SettingsPage() {
  const { shop, reloadShop } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState<Form>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    api.shop()
      .then(data => { if (alive) setForm({ name: data.name, tone: data.tone, shipping: data.shipping, payment: data.payment, workingHours: data.workingHours, handoffMessage: data.handoffMessage }); })
      .catch(() => { if (alive) setError('دریافت تنظیمات انجام نشد.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const set = (key: keyof Form) => (event: { target: { value: string } }) =>
    setForm(previous => ({ ...previous, [key]: event.target.value }));

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.updateShop(form);
      await reloadShop();
      toast.success('تنظیمات ذخیره شد', 'پاسخ‌های دستیار از این پس با همین اطلاعات ساخته می‌شوند.');
    } catch (problem) {
      const message = problem instanceof ApiError ? problem.message : 'ذخیره تنظیمات انجام نشد.';
      setError(message);
      toast.error('ذخیره انجام نشد', message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="stack">
        <SkeletonBlock height={64} />
        <SkeletonBlock height={320} />
      </div>
    );
  }

  const completeness = [form.name, form.tone, form.shipping, form.payment, form.workingHours, form.handoffMessage].filter(value => value.trim().length > 0).length;
  const percent = Math.round((completeness / 6) * 100);

  return (
    <div className="stack">
      <PageHeader
        title="تنظیمات فروشگاه"
        description="این اطلاعات همان چیزی است که دستیار در پاسخ‌های ارسال، پرداخت و ساعت کاری استفاده می‌کند."
        actions={<Link href="/app/assistant" className="btn btn-outline"><IconChat size={16} />آزمایش پاسخ</Link>}
      />

      <div className="split">
        <form className="stack" onSubmit={save}>
          <section className="card">
            <div className="card-head">
              <div className="row" style={{ gap: 10 }}>
                <span className="stat-ico"><IconStore size={17} /></span>
                <div>
                  <div className="card-title">هویت فروشگاه</div>
                  <div className="card-desc">نام و لحن پاسخ‌گویی</div>
                </div>
              </div>
            </div>
            <div className="card-body" style={{ display: 'grid', gap: 14 }}>
              <Field label="نام فروشگاه" required htmlFor="name">
                <input id="name" className="input" required maxLength={200} value={form.name} onChange={set('name')} />
              </Field>
              <Field label="لحن پاسخ" htmlFor="tone" hint="مثال: صمیمی و مؤدبانه، بدون اغراق. این لحن در پاسخ‌ها لحاظ می‌شود.">
                <input id="tone" className="input" maxLength={2000} value={form.tone} onChange={set('tone')} placeholder="صمیمی و مؤدبانه، بدون اغراق" />
              </Field>
            </div>
          </section>

          <section className="card">
            <div className="card-head">
              <div className="row" style={{ gap: 10 }}>
                <span className="stat-ico"><IconSettings size={17} /></span>
                <div>
                  <div className="card-title">اطلاعات پاسخ‌گویی</div>
                  <div className="card-desc">اگر خالی بماند، دستیار برای این سؤال‌ها شما را ارجاع می‌دهد</div>
                </div>
              </div>
            </div>
            <div className="card-body" style={{ display: 'grid', gap: 14 }}>
              <Field label="شرایط ارسال" htmlFor="shipping" hint="هزینه، روش و زمان تحویل را بنویسید.">
                <textarea id="shipping" className="textarea" maxLength={2000} value={form.shipping} onChange={set('shipping')}
                  placeholder="ارسال با پست پیشتاز ۴۵٬۰۰۰ تومان؛ سفارش بالای ۲ میلیون تومان رایگان." />
              </Field>
              <Field label="روش‌های پرداخت" htmlFor="payment">
                <textarea id="payment" className="textarea" maxLength={2000} value={form.payment} onChange={set('payment')}
                  placeholder="کارت به کارت یا درگاه آنلاین؛ لینک پرداخت پس از تأیید سفارش ارسال می‌شود." />
              </Field>
              <Field label="ساعت کاری" htmlFor="workingHours">
                <input id="workingHours" className="input" maxLength={2000} value={form.workingHours} onChange={set('workingHours')}
                  placeholder="شنبه تا پنجشنبه، ۱۰ صبح تا ۸ شب." />
              </Field>
              <Field label="پیام ارجاع به فروشنده" htmlFor="handoffMessage" hint="هر جا دستیار مطمئن نبود، همین پیام برای مشتری ارسال می‌شود.">
                <textarea id="handoffMessage" className="textarea" maxLength={2000} value={form.handoffMessage} onChange={set('handoffMessage')} />
              </Field>
            </div>
            <div className="card-foot row-between">
              <span className="small muted">تغییرات پس از ذخیره، در پاسخ‌های آزمایشی و واقعی اعمال می‌شود.</span>
              <button className="btn btn-primary" type="submit" disabled={busy}>
                {busy ? <Spinner size={15} /> : <IconCheckCircle size={16} />}
                ذخیره تنظیمات
              </button>
            </div>
          </section>

          {error && <div className="alert alert-error"><IconAlertCircle /><span>{error}</span></div>}
        </form>

        <div className="stack">
          <section className="card card-pad">
            <div className="row-between" style={{ marginBottom: 8 }}>
              <strong>کامل‌بودن پروفایل</strong>
              <span className="badge b-brand num">{percent}٪</span>
            </div>
            <div className="progress"><span style={{ width: `${percent}%` }} /></div>
            <p className="small muted mt-3" style={{ lineHeight: 1.95 }}>
              هر چه این بخش‌ها کامل‌تر باشد، دستیار بیشتر می‌تواند بدون ارجاع پاسخ بدهد و بار پاسخ‌گویی دستی کمتر می‌شود.
            </p>
          </section>

          <section className="card">
            <div className="card-head"><div className="card-title">پیش‌نمایش پاسخ</div></div>
            <div className="card-body" style={{ display: 'grid', gap: 10 }}>
              <PreviewRow label="اگر بپرسند «ارسال چطوریه؟»" value={form.shipping} fallback="به فروشنده ارجاع داده می‌شود" />
              <PreviewRow label="اگر بپرسند «پرداخت چطوره؟»" value={form.payment} fallback="به فروشنده ارجاع داده می‌شود" />
              <PreviewRow label="اگر بپرسند «کی باز هستید؟»" value={form.workingHours} fallback="به فروشنده ارجاع داده می‌شود" />
            </div>
          </section>

          <section className="card card-pad" style={{ background: 'linear-gradient(160deg, var(--brand-50), #fff 70%)', borderColor: 'var(--brand-100)' }}>
            <strong style={{ display: 'block', marginBottom: 6 }}>فروشگاه فعلی</strong>
            <div className="small muted">{shop?.name ?? form.name}</div>
            <div className="small muted" style={{ marginTop: 2 }}>
              شناسه فروشگاه: <span className="mono">{shop?.id?.slice(0, 8) ?? '—'}…</span>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function PreviewRow({ label, value, fallback }: { label: string; value: string; fallback: string }) {
  const filled = value.trim().length > 0;
  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 'var(--r-md)', padding: '10px 12px', background: filled ? 'var(--surface-2)' : 'var(--amber-soft)' }}>
      <div className="small muted" style={{ marginBottom: 3 }}>{label}</div>
      <div className="small" style={{ fontWeight: 500 }}>{filled ? value : fallback}</div>
    </div>
  );
}
