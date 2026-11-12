'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiError, type Shop } from '@/lib/api';
import { Field, PageHeader, SkeletonBlock, Spinner, useToast } from '@/components/ui';
import { IconAlertCircle, IconCheckCircle } from '@/components/icons';

type Step = 1 | 2 | 3;

const STEPS = [
  { n: 1 as Step, title: 'اطلاعات کسب‌وکار و لحن' },
  { n: 2 as Step, title: 'منابع دانش' },
  { n: 3 as Step, title: 'رفتار و اتصال' },
];

/**
 * ویزارد راه‌اندازی دستیار (۳ مرحله).
 * مرحله ۱: اطلاعات کسب‌وکار + لحن با جمله‌ی نمونه.
 * مرحله ۲: منابع دانش (Q&A) — لینک به زبانه‌ی دانش صفحه‌ی دستیار.
 * مرحله ۳: رفتار (ارجاع، ساعت کاری) + وضعیت اتصال کانال‌ها.
 */
export default function WizardPage() {
  const toast = useToast();
  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: '', tone: '', shipping: '', payment: '', workingHours: '', returns: '', handoffMessage: '' });
  const [sample, setSample] = useState('');
  const [knowledgeCount, setKnowledgeCount] = useState(0);
  const [channels, setChannels] = useState<{ platform: string; status: string }[]>([]);

  useEffect(() => {
    api.shop()
      .then(data => setForm({
        name: data.name, tone: data.tone, shipping: data.shipping, payment: data.payment,
        workingHours: data.workingHours, returns: data.returns ?? '', handoffMessage: data.handoffMessage,
      }))
      .catch(() => undefined)
      .finally(() => setLoading(false));
    api.knowledge().then(list => setKnowledgeCount(list.filter(item => item.active).length)).catch(() => undefined);
    api.channels().then(list => setChannels(list.map(item => ({ platform: item.platform, status: item.status })))).catch(() => undefined);
  }, []);

  const set = (key: keyof typeof form) => (event: { target: { value: string } }) =>
    setForm(previous => ({ ...previous, [key]: event.target.value }));

  async function saveStep() {
    setBusy(true);
    try {
      await api.updateShop(form);
      toast.success('ذخیره شد.');
      if (step < 3) setStep((step + 1) as Step);
    } catch (problem) {
      toast.error('ذخیره انجام نشد', problem instanceof ApiError ? problem.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  async function testSample() {
    if (!sample.trim()) return;
    try {
      const reply = await api.botPreview(sample.trim());
      toast.success('پاسخ آزمایشی آماده است', reply.text.slice(0, 120));
    } catch (problem) {
      toast.error('دریافت پاسخ انجام نشد', problem instanceof ApiError ? problem.message : undefined);
    }
  }

  if (loading) {
    return <div className="stack"><SkeletonBlock height={64} /><SkeletonBlock height={320} /></div>;
  }

  return (
    <div className="stack">
      <PageHeader
        eyebrow="راه‌اندازی"
        title="ویزارد دستیار فروش"
        description="در سه قدم، دستیار را برای فروشگاه‌تان آماده کنید."
      />

      <div className="chip-tabs" role="group" aria-label="مراحل ویزارد" style={{ marginBottom: 4 }}>
        {STEPS.map(item => (
          <button
            key={item.n}
            type="button"
            className={`chip-btn ${step === item.n ? 'on' : ''}`}
            onClick={() => setStep(item.n)}
          >
            {item.n} · {item.title}
          </button>
        ))}
      </div>

      {step === 1 && (
        <section className="card">
          <div className="card-head">
            <div className="card-title">مرحله‌ی ۱ — اطلاعات کسب‌وکار و لحن</div>
          </div>
          <div className="card-body" style={{ display: 'grid', gap: 14 }}>
            <Field label="نام فروشگاه" required htmlFor="wz-name">
              <input id="wz-name" className="input" required maxLength={200} value={form.name} onChange={set('name')} />
            </Field>
            <Field label="لحن پاسخ" htmlFor="wz-tone" hint="لحن فقط نحوه‌ی گفتن را عوض می‌کند؛ قیمت و موجودی همیشه از کاتالوگ می‌آید.">
              <input id="wz-tone" className="input" maxLength={2000} value={form.tone} onChange={set('tone')} placeholder="صمیمی و مؤدبانه، بدون اغراق" />
            </Field>
            <Field label="جمله‌ی نمونه برای آزمایش لحن" htmlFor="wz-sample" hint="یک سؤال نمونه بنویسید و پاسخ آزمایشی را ببینید.">
              <div className="row" style={{ gap: 8 }}>
                <input id="wz-sample" className="input" value={sample} onChange={event => setSample(event.target.value)} placeholder="قیمت مانتو کتان چنده؟" />
                <button type="button" className="btn btn-outline" onClick={() => void testSample()}>آزمایش</button>
              </div>
            </Field>
            <Field label="شرایط ارسال" htmlFor="wz-shipping">
              <textarea id="wz-shipping" className="textarea" maxLength={2000} value={form.shipping} onChange={set('shipping')} placeholder="ارسال با پست پیشتاز…" />
            </Field>
            <Field label="روش پرداخت" htmlFor="wz-payment" hint="پرداخت مشتری همیشه کارت‌به‌کارت است؛ شماره کارت‌ها را در تنظیمات ثبت کنید.">
              <textarea id="wz-payment" className="textarea" maxLength={2000} value={form.payment} onChange={set('payment')} placeholder="پرداخت کارت‌به‌کارت…" />
            </Field>
          </div>
          <div className="card-foot row-between">
            <span className="small muted">مرحله‌ی ۱ از ۳</span>
            <button className="btn btn-primary" disabled={busy} onClick={() => void saveStep()}>
              {busy && <Spinner size={14} />}ذخیره و ادامه
            </button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="card">
          <div className="card-head">
            <div className="card-title">مرحله‌ی ۲ — منابع دانش</div>
          </div>
          <div className="card-body" style={{ display: 'grid', gap: 14 }}>
            <div className="alert alert-info">
              <IconCheckCircle />
              <span>الان {knowledgeCount.toLocaleString('fa-IR')} پرسش‌وپاسخ فعال دارید. هرچه بیشتر، دستیار کمتر به شما ارجاع می‌دهد.</span>
            </div>
            <p className="small muted" style={{ lineHeight: 1.95 }}>
              محصولات و خدمات از کاتالوگ می‌آیند. این‌جا سؤال‌های پرتکرار را بنویسید:
              مرجوعی، کد تخفیف، ضمانت، زمان تحویل و…
            </p>
            <div className="row">
              <Link href="/app/assistant" className="btn btn-primary">افزودن پرسش‌وپاسخ</Link>
              <Link href="/app/products" className="btn btn-outline">مشاهده کاتالوگ</Link>
            </div>
          </div>
          <div className="card-foot row-between">
            <button className="btn btn-ghost" onClick={() => setStep(1)}>مرحله‌ی قبل</button>
            <button className="btn btn-primary" onClick={() => setStep(3)}>ادامه</button>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="card">
          <div className="card-head">
            <div className="card-title">مرحله‌ی ۳ — رفتار و اتصال</div>
          </div>
          <div className="card-body" style={{ display: 'grid', gap: 14 }}>
            <Field label="ساعت کاری" htmlFor="wz-hours">
              <input id="wz-hours" className="input" maxLength={2000} value={form.workingHours} onChange={set('workingHours')} placeholder="شنبه تا پنجشنبه، ۱۰ صبح تا ۸ شب" />
            </Field>
            <Field label="سیاست مرجوعی و تعویض" htmlFor="wz-returns">
              <textarea id="wz-returns" className="textarea" maxLength={2000} value={form.returns} onChange={set('returns')} placeholder="تا ۷ روز پس از دریافت…" />
            </Field>
            <Field label="پیام ارجاع به فروشنده" htmlFor="wz-handoff" hint="وقتی بات بعد از چند سؤال هم منظور مشتری را نفهمید.">
              <textarea id="wz-handoff" className="textarea" maxLength={2000} value={form.handoffMessage} onChange={set('handoffMessage')} />
            </Field>

            <div style={{ borderTop: '1px solid var(--line)', paddingTop: 14, display: 'grid', gap: 8 }}>
              <div className="card-title">حساب‌های متصل</div>
              {channels.length === 0 && (
                <div className="alert alert-warn">
                  <IconAlertCircle />
                  <span>هنوز هیچ کانالی وصل نیست. برای اینکه دستیار به مشتری جواب بدهد، دست‌کم اینستاگرام یا تلگرام را وصل کنید.</span>
                </div>
              )}
              {channels.map((channel, index) => (
                <div key={index} className="row-between" style={{ border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px' }}>
                  <span className="strong" style={{ fontSize: 'var(--fs-sm)' }}>
                    {channel.platform === 'INSTAGRAM' ? 'اینستاگرام' : channel.platform === 'TELEGRAM' ? 'تلگرام' : channel.platform === 'BALE' ? 'بله' : 'روبیکا'}
                  </span>
                  <span className={`badge ${channel.status === 'CONNECTED' ? 'b-green' : 'b-gray'}`}>
                    {channel.status === 'CONNECTED' ? 'وصل است' : channel.status}
                  </span>
                </div>
              ))}
              <div className="row">
                <Link href="/app/settings" className="btn btn-outline btn-sm">اتصال کانال‌ها</Link>
              </div>
            </div>
          </div>
          <div className="card-foot row-between">
            <button className="btn btn-ghost" onClick={() => setStep(2)}>مرحله‌ی قبل</button>
            <div className="row" style={{ gap: 8 }}>
              <Link href="/app/assistant" className="btn btn-outline">آزمایش دستیار</Link>
              <button className="btn btn-primary" disabled={busy} onClick={() => void saveStep()}>
                {busy && <Spinner size={14} />}ذخیره نهایی
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
