'use client';

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { api, request, ApiError, type PaymentMethod, type ReceiptPolicy, type ShippingMethod, type Shop } from '@/lib/api';
import { Field, Modal, PageHeader, SkeletonBlock, Spinner, Switch, useToast } from '@/components/ui';
import { TelegramConnect } from '@/components/telegram-connect';
import { ChannelConnect } from '@/components/channel-connect';
import { InstagramConnect } from '@/components/instagram-connect';
import { IconAlertCircle, IconCheckCircle, IconChat, IconSettings, IconStore } from '@/components/icons';

type Form = Pick<Shop, 'name' | 'tone' | 'shipping' | 'payment' | 'workingHours' | 'returns' | 'handoffMessage'>;
const EMPTY: Form = { name: '', tone: '', shipping: '', payment: '', workingHours: '', returns: '', handoffMessage: '' };

/** پیش‌فرض‌های لحن — با یک کلیک در کادر لحن می‌نشینند؛ متن آزاد هم ممکن است. */
const TONE_PRESETS = [
  { label: 'صمیمی و دوستانه', value: 'صمیمی، گرم و مؤدبانه؛ مثل یک فروشنده‌ی آشنا. کوتاه و بدون اغراق.' },
  { label: 'رسمی و حرفه‌ای', value: 'رسمی، مؤدبانه و دقیق؛ بدون ایموجی و بدون خودمانی‌شدن.' },
  { label: 'پرانرژی و مشتاقانه', value: 'پرانرژی و مشتاقانه؛ مشتری را به خرید تشویق می‌کند ولی قیمت و موجودی را عوض نمی‌کند.' },
  { label: 'مینیمال و مستقیم', value: 'خیلی کوتاه و مستقیم؛ فقط اطلاعات، بدون مقدمه و تشریفات.' },
];

export default function SettingsPage() {
  const { shop, reloadShop } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState<Form>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [smsPhone,setSmsPhone]=useState(''); const [smsCode,setSmsCode]=useState(''); const [smsOtpSent,setSmsOtpSent]=useState(false); const [notifySellerSms,setNotifySellerSms]=useState(true);
  const [planState, setPlanState] = useState<{ mode: string; trialEndsAt: string | null; subscription: { planName: string; endsAt?: string; extraInstagram?: number } | null } | null>(null);

  useEffect(() => {
    let alive = true;
    request<{ mode: string; trialEndsAt: string | null; subscription: { planName: string; endsAt?: string; extraInstagram?: number } | null }>('/subscriptions/status').then(setPlanState).catch(() => undefined);
    api.shop()
      .then(data => { if (alive) setForm({ name: data.name, tone: data.tone, shipping: data.shipping, payment: data.payment, workingHours: data.workingHours, returns: data.returns ?? '', handoffMessage: data.handoffMessage }); setSmsPhone(data.smsPhone ?? ''); setNotifySellerSms(data.notifySellerBySms ?? true); })
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
      await api.updateShop({...form, notifySellerBySms:notifySellerSms});
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

  // فهرست فیلدها تنها منبع شمارش است: قبلاً هفت مقدار شمرده می‌شد ولی بر شش
  // تقسیم می‌شد و پروفایل کامل «۱۱۷٪» نشان می‌داد. حالا عدد هرگز از ۱۰۰ رد نمی‌شود.
  const profileFields = [form.name, form.tone, form.shipping, form.payment, form.workingHours, form.returns, form.handoffMessage];
  const completeness = profileFields.filter(value => value.trim().length > 0).length;
  const percent = Math.min(100, Math.round((completeness / profileFields.length) * 100));

  return (
    <div className="stack">
      <PageHeader
        eyebrow="پیکربندی"
        title="تنظیمات فروشگاه"
        description="این اطلاعات همان چیزی است که دستیار در پاسخ‌های ارسال، پرداخت و ساعت کاری استفاده می‌کند."
        actions={<Link href="/app/assistant" className="btn btn-outline"><IconChat size={16} />آزمایش پاسخ</Link>}
      />

      <div className="split">
        <form className="stack" onSubmit={save}>
          <section className="card">
            <div className="card-head">
              <div className="row" style={{ gap: 10 }}>
                <span className="stat-ico"><IconStore size={15} /></span>
                <div>
                  <div className="card-title">هویت فروشگاه</div>
                  <div className="card-desc">نام و لحن پاسخ‌گویی</div>
                </div>
              </div>
              <span className="card-index num">۰۱</span>
            </div>
            <div className="card-body" style={{ display: 'grid', gap: 14 }}>
              <Field label="نام فروشگاه" required htmlFor="name">
                <input id="name" className="input" required maxLength={200} value={form.name} onChange={set('name')} />
              </Field>
              <Field label="لحن پاسخ" htmlFor="tone" hint="لحن فقط نحوه‌ی گفتن را عوض می‌کند؛ قیمت و موجودی همیشه از کاتالوگ می‌آید و هرگز با لحن عوض نمی‌شود.">
                <input id="tone" className="input" maxLength={2000} value={form.tone} onChange={set('tone')} placeholder="صمیمی و مؤدبانه، بدون اغراق" />
              </Field>
              <div className="tone-presets" role="group" aria-label="پیش‌فرض‌های لحن">
                {TONE_PRESETS.map(preset => (
                  <button
                    key={preset.label}
                    type="button"
                    className={`chip-btn ${form.tone === preset.value ? 'on' : ''}`}
                    aria-pressed={form.tone === preset.value}
                    onClick={() => setForm(previous => ({ ...previous, tone: preset.value }))}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="card">
            <div className="card-head">
              <div className="row" style={{ gap: 10 }}>
                <span className="stat-ico"><IconSettings size={15} /></span>
                <div>
                  <div className="card-title">اطلاعات پاسخ‌گویی</div>
                  <div className="card-desc">اگر خالی بماند، دستیار برای این سؤال‌ها شما را ارجاع می‌دهد</div>
                </div>
              </div>
              <span className="card-index num">۰۲</span>
            </div>
            <div className="card-body" style={{ display: 'grid', gap: 14 }}>
              <Field label="شرایط ارسال" htmlFor="shipping" hint="هزینه، روش و زمان تحویل را بنویسید.">
                <textarea id="shipping" className="textarea" maxLength={2000} value={form.shipping} onChange={set('shipping')}
                  placeholder="ارسال با پست پیشتاز ۴۵٬۰۰۰ تومان؛ سفارش بالای ۲ میلیون تومان رایگان." />
              </Field>
              <Field label="توضیح پرداخت (برای پاسخ دستیار)" htmlFor="payment" hint="متن آزاد برای پاسخ‌گویی دستیار. شماره کارت‌های واقعی را در بخش «روش‌های پرداخت» پایین همین صفحه ثبت کنید؛ پرداخت مشتری همیشه کارت‌به‌کارت است.">
                <textarea id="payment" className="textarea" maxLength={2000} value={form.payment} onChange={set('payment')}
                  placeholder="پرداخت کارت‌به‌کارت است؛ بعد از واریز، عکس رسید را بفرستید." />
              </Field>
              <Field label="ساعت کاری" htmlFor="workingHours">
                <input id="workingHours" className="input" maxLength={2000} value={form.workingHours} onChange={set('workingHours')}
                  placeholder="شنبه تا پنجشنبه، ۱۰ صبح تا ۸ شب." />
              </Field>
              <Field label="سیاست مرجوعی و تعویض" htmlFor="returns" hint="اگر پرش کنید، بات سؤال «مرجوعی دارید؟» را خودش جواب می‌دهد. خالی باشد، بعد از چند سؤال به شما ارجاع می‌دهد.">
                <textarea id="returns" className="textarea" maxLength={2000} value={form.returns} onChange={set('returns')}
                  placeholder="مثال: تا ۷ روز پس از دریافت، اگر برچسب نخورده باشد، تعویض یا مرجوع می‌کنیم." />
              </Field>
              <Field label="پیام ارجاع به فروشنده" htmlFor="handoffMessage" hint="فقط وقتی ارسال می‌شود که بات بعد از چند سؤال هم منظور مشتری را نفهمیده باشد.">
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
          <section className="card card-pad stack"><h2>اعلان پیامکی سفارش</h2><p className="muted">برای دریافت پیامک فروشنده، شماره موبایل را با کد یک‌بارمصرف تأیید کنید. پیامک مشتری پس از پرداخت جداگانه ارسال می‌شود.</p><Field label="شماره موبایل فروشنده" htmlFor="sellerSms"><input id="sellerSms" className="input input-ltr" dir="ltr" placeholder="09123456789" value={smsPhone} onChange={e=>setSmsPhone(e.target.value)} /></Field>{smsOtpSent && <Field label="کد تأیید" htmlFor="sellerSmsCode"><input id="sellerSmsCode" className="input input-ltr" dir="ltr" inputMode="numeric" maxLength={6} value={smsCode} onChange={e=>setSmsCode(e.target.value)} /></Field>}<div className="row"><button type="button" className="btn btn-outline" onClick={async()=>{try{await request('/auth/phone/otp/request',{method:'POST',body:{phone:smsPhone}});setSmsOtpSent(true);toast.success('کد ارسال شد','درگاه فعلی Mock است.');}catch(e){toast.error('ارسال نشد',e instanceof Error?e.message:'خطا');}}}>{smsOtpSent?'ارسال دوباره کد':'تأیید شماره'}</button>{smsOtpSent&&<button type="button" className="btn btn-primary" onClick={async()=>{try{await request('/auth/phone/otp/verify',{method:'POST',body:{phone:smsPhone,code:smsCode}});toast.success('شماره تأیید شد','شماره برای پیامک فروشنده ثبت شد.');}catch(e){toast.error('تأیید نشد',e instanceof Error?e.message:'کد نامعتبر');}}}>ثبت کد</button>}</div><label className="row"><input type="checkbox" checked={notifySellerSms} onChange={e=>setNotifySellerSms(e.target.checked)} />ارسال پیامک سفارش برای من (اختیاری)</label></section>
        </form>

        <PaymentMethodsSection />

        <ShippingMethodsSection />

        <ChannelConnect />

        <div className="stack">
          <section className="card card-pad">
            <div className="kv-k" style={{ marginBottom: 10 }}>کامل‌بودن پروفایل</div>
            <div className="row" style={{ gap: 8, alignItems: 'baseline' }}>
              <span className="num" style={{ fontSize: 34, fontWeight: 300, lineHeight: 1 }}>{percent}٪</span>
              <span className="small muted">از <span className="num">{completeness.toLocaleString('fa-IR')}</span> فیلدِ تکمیل‌شده از <span className="num">{profileFields.length.toLocaleString('fa-IR')}</span></span>
            </div>
            <div className="progress mt-3"><span style={{ width: `${percent}%` }} /></div>
            <p className="small muted mt-3" style={{ lineHeight: 1.95 }}>
              هر چه این بخش‌ها کامل‌تر باشد، دستیار بیشتر می‌تواند بدون ارجاع پاسخ بدهد و بار پاسخ‌گویی دستی کمتر می‌شود.
            </p>
          </section>

          <section className="card">
            <div className="card-head"><div className="card-title">پیش‌نمایش پاسخ</div></div>
            <div className="card-body" style={{ paddingBlock: 6 }}>
              <div className="kv">
              <PreviewRow label="اگر بپرسند «ارسال چطوریه؟»" value={form.shipping} fallback="به فروشنده ارجاع داده می‌شود" />
              <PreviewRow label="اگر بپرسند «پرداخت چطوره؟»" value={form.payment} fallback="به فروشنده ارجاع داده می‌شود" />
              <PreviewRow label="اگر بپرسند «کی باز هستید؟»" value={form.workingHours} fallback="به فروشنده ارجاع داده می‌شود" />
              <PreviewRow label="اگر بپرسند «مرجوعی دارید؟»" value={form.returns} fallback="اول می‌پرسد، بعد ارجاع می‌دهد" />
              </div>
            </div>
          </section>

          <section className="card card-pad stack">
            <div className="row-between"><div><div className="card-title">وضعیت اشتراک</div><div className="small muted">{planState?.mode === 'paid' ? `پلن ${planState.subscription?.planName}` : planState?.mode === 'trial' ? 'دورهٔ آزمایشی ۶روزه' : 'اشتراک فعال ندارید'}</div></div><Link className="btn btn-outline btn-sm" href="/#plans">مشاهده پلن‌ها</Link></div>
            {planState?.trialEndsAt && planState.mode === 'trial' ? <div className="small muted">پایان دوره: {new Date(planState.trialEndsAt).toLocaleDateString('fa-IR')}</div> : null}
            {planState?.mode === 'paid' && planState.subscription?.endsAt ? <div className="small muted">اعتبار تا {new Date(planState.subscription.endsAt).toLocaleDateString('fa-IR')}</div> : null}
            {planState?.mode === 'paid' && planState.subscription?.extraInstagram ? <div className="small muted">پیج اینستاگرام اضافه: {planState.subscription.extraInstagram.toLocaleString('fa-IR')} پیج</div> : null}
            {planState?.mode === 'expired' ? <div className="alert alert-warn">بات قفل است؛ اطلاعات فروشگاه شما حذف نشده است.</div> : null}
          </section>
          <TelegramConnect />

          <InstagramConnect />

          <section className="card">
            <div className="card-head">
              <div className="card-title">فروشگاه فعلی</div>
              <span className="card-index">حساب</span>
            </div>
            <div className="card-body" style={{ paddingBlock: 6 }}>
              <div className="kv">
                <div className="kv-row">
                  <span className="kv-k">نام</span>
                  <span className="kv-v">{shop?.name ?? form.name}</span>
                </div>
                <div className="kv-row">
                  <span className="kv-k">شناسه</span>
                  <span className="kv-v mono">{shop?.id ? `${shop.id.slice(0, 8)}…` : '—'}</span>
                </div>
                <div className="kv-row">
                  <span className="kv-k">وضعیت</span>
                  <span className="kv-v"><span className="badge b-green"><span className="dot" />فعال</span></span>
                </div>
              </div>
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
    <div className="kv-row">
      <span className="kv-k">{label}</span>
      <span className={`kv-v ${filled ? '' : 'missing'}`}>{filled ? value : fallback}</span>
    </div>
  );
}

/* ------------------------------------------------------------ payment methods */

function PaymentMethodsSection() {
  const toast = useToast();
  const [methods, setMethods] = useState<PaymentMethod[] | null>(null);
  const [policy, setPolicy] = useState<ReceiptPolicy | null>(null);
  const [editing, setEditing] = useState<PaymentMethod | 'new' | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => {
    api.paymentMethods().then(setMethods).catch(() => setMethods([]));
    api.receiptPolicy().then(setPolicy).catch(() => setPolicy(null));
  };

  useEffect(load, []);

  async function toggle(method: PaymentMethod, active: boolean) {
    setBusy(true);
    try {
      await api.updatePaymentMethod(method.id, { active });
      toast.success(active ? 'کارت فعال شد.' : 'کارت غیرفعال شد.');
      load();
    } catch (problem) {
      toast.error('تغییر وضعیت انجام نشد', problem instanceof ApiError ? problem.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  async function remove(method: PaymentMethod) {
    setBusy(true);
    try {
      await api.deletePaymentMethod(method.id);
      toast.success('کارت حذف شد.');
      load();
    } catch (problem) {
      toast.error('حذف انجام نشد', problem instanceof ApiError ? problem.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  async function savePolicy(patch: Partial<ReceiptPolicy>) {
    setBusy(true);
    try {
      const updated = await api.updateReceiptPolicy(patch);
      setPolicy(updated);
      toast.success('سیاست رسید ذخیره شد.');
    } catch (problem) {
      toast.error('ذخیره سیاست انجام نشد', problem instanceof ApiError ? problem.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <div className="card-head">
        <div className="row" style={{ gap: 10 }}>
          <span className="stat-ico"><IconSettings size={15} /></span>
          <div>
            <div className="card-title">روش‌های پرداخت (کارت‌به‌کارت)</div>
            <div className="card-desc">شماره کارت‌ها هنگام ثبت سفارش به مشتری نمایش داده می‌شوند. پرداخت مشتری همیشه کارت‌به‌کارت است.</div>
          </div>
        </div>
        <span className="card-index num">۰۳</span>
      </div>
      <div className="card-body" style={{ display: 'grid', gap: 14 }}>
        {methods === null && <SkeletonBlock height={60} />}
        {methods !== null && methods.length === 0 && (
          <div className="alert alert-warn">
            <IconAlertCircle />
            <span>هنوز هیچ کارتی ثبت نشده است. تا وقتی کارتی ثبت نکنید، مشتری هنگام سفارش نمی‌داند به کجا واریز کند.</span>
          </div>
        )}
        {methods?.map(method => (
          <div key={method.id} className="row-between" style={{ border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px' }}>
            <div>
              <div className="strong" style={{ fontSize: 'var(--fs-sm)' }}>{method.holderName}</div>
              <div className="small muted mono">{method.masked}{method.bankName ? ` · ${method.bankName}` : ''}</div>
            </div>
            <div className="row" style={{ gap: 6 }}>
              <Switch label="فعال" checked={method.active} onChange={next => void toggle(method, next)} />
              <button className="btn btn-outline btn-sm" disabled={busy} onClick={() => setEditing(method)}>ویرایش</button>
              <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void remove(method)} style={{ color: 'var(--danger)' }}>حذف</button>
            </div>
          </div>
        ))}
        <button className="btn btn-outline btn-sm" onClick={() => setEditing('new')}>
          + افزودن کارت
        </button>

        {policy && (
          <div style={{ display: 'grid', gap: 10, borderTop: '1px solid var(--line)', paddingTop: 14 }}>
            <div className="card-title">سیاست رسید پرداخت</div>
            <Switch
              label="تأیید خودکار رسید وقتی مبلغ و مقصد درست است"
              checked={policy.receiptAutoConfirm}
              onChange={next => void savePolicy({ receiptAutoConfirm: next })}
            />
            <div className="grid g-2">
              <Field label="سقف مبلغ تأیید خودکار (تومان)" htmlFor="autoMax" hint="خالی = بدون سقف. بالاتر از این مبلغ، رسید برای بررسی شما می‌آید.">
                <input
                  id="autoMax" className="input input-ltr" type="number" min={0} max={2147483647}
                  defaultValue={policy.receiptAutoConfirmMax ?? ''}
                  key={String(policy.receiptAutoConfirmMax)}
                  onBlur={event => {
                    const value = event.target.value.trim();
                    void savePolicy({ receiptAutoConfirmMax: value === '' ? null : Number(value) });
                  }}
                />
              </Field>
              <Field label="مهلت انتظار پرداخت (ساعت)" htmlFor="waitHours" hint="بعد از این مهلت، سفارش لغو و موجودی آزاد می‌شود.">
                <input
                  id="waitHours" className="input input-ltr" type="number" min={1} max={168}
                  defaultValue={policy.paymentWaitHours}
                  key={String(policy.paymentWaitHours)}
                  onBlur={event => void savePolicy({ paymentWaitHours: Number(event.target.value) || 24 })}
                />
              </Field>
            </div>
          </div>
        )}
      </div>

      {editing && (
        <PaymentMethodModal
          method={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </section>
  );
}

function PaymentMethodModal({ method, onClose, onSaved }: { method: PaymentMethod | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const body = {
      holderName: String(data.get('holderName') ?? '').trim(),
      cardNumber: String(data.get('cardNumber') ?? '').trim(),
      bankName: String(data.get('bankName') ?? '').trim(),
      sheba: String(data.get('sheba') ?? '').trim(),
      instruction: String(data.get('instruction') ?? '').trim(),
    };
    setBusy(true);
    try {
      if (method) {
        const { cardNumber, ...rest } = body;
        await api.updatePaymentMethod(method.id, cardNumber ? { ...rest, cardNumber } : rest);
        toast.success('کارت به‌روزرسانی شد.');
      } else {
        await api.createPaymentMethod(body);
        toast.success('کارت اضافه شد.');
      }
      onSaved();
    } catch (problem) {
      toast.error('ذخیره انجام نشد', problem instanceof ApiError ? problem.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open onClose={onClose} title={method ? 'ویرایش کارت' : 'کارت جدید'}
      description="شماره کارت فقط رمزنگاری‌شده ذخیره می‌شود و هرگز در پاسخ‌ها یا لاگ‌ها دیده نمی‌شود."
      footer={<><button className="btn btn-ghost" onClick={onClose}>انصراف</button><button className="btn btn-primary" form="pm-form" disabled={busy}>{busy && <Spinner size={14} />}ذخیره</button></>}
    >
      <form id="pm-form" onSubmit={submit} style={{ display: 'grid', gap: 14 }}>
        <Field label="نام دارنده‌ی کارت" required htmlFor="holderName">
          <input id="holderName" name="holderName" className="input" required maxLength={200} defaultValue={method?.holderName ?? ''} placeholder="مثلاً علی رضایی" autoFocus />
        </Field>
        <Field label="شماره کارت (۱۶ رقم)" required={!method} htmlFor="cardNumber" hint={method ? 'خالی بگذارید تا شماره‌ی فعلی بماند.' : 'با رقم کنترل اعتبارسنجی می‌شود.'}>
          <input id="cardNumber" name="cardNumber" className="input input-ltr" required={!method} inputMode="numeric" maxLength={19} placeholder="6037 9912 3456 7893" />
        </Field>
        <div className="grid g-2">
          <Field label="نام بانک" htmlFor="bankName">
            <input id="bankName" name="bankName" className="input" maxLength={100} defaultValue={method?.bankName ?? ''} placeholder="ملی، ملت…" />
          </Field>
          <Field label="شبا (اختیاری)" htmlFor="sheba">
            <input id="sheba" name="sheba" className="input input-ltr" maxLength={26} defaultValue={method?.sheba ?? ''} placeholder="IR…" />
          </Field>
        </div>
        <Field label="متن دستور پرداخت" htmlFor="instruction" hint="مثلاً: «فقط به همین کارت واریز کنید و رسید بفرستید.»">
          <input id="instruction" name="instruction" className="input" maxLength={500} defaultValue={method?.instruction ?? ''} />
        </Field>
      </form>
    </Modal>
  );
}

/* ------------------------------------------------------------ shipping methods */

const SHIPPING_KINDS: { value: ShippingMethod['kind']; label: string; hint: string }[] = [
  { value: 'FIXED', label: 'مبلغ ثابت', hint: 'برای همه‌ی مقصدها یک مبلغ.' },
  { value: 'FREE_OVER', label: 'رایگان بالای آستانه', hint: 'بالای مبلغ مشخص رایگان، وگرنه مبلغ ثابت.' },
  { value: 'TABLE', label: 'جدول استانی/شهری', hint: 'هر استان/شهر مبلغ خودش؛ کلید * برای بقیه.' },
  { value: 'PICKUP', label: 'برداشت حضوری', hint: 'همیشه رایگان.' },
];

function ShippingMethodsSection() {
  const toast = useToast();
  const [methods, setMethods] = useState<ShippingMethod[] | null>(null);
  const [editing, setEditing] = useState<ShippingMethod | 'new' | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => {
    api.shippingMethods().then(setMethods).catch(() => setMethods([]));
  };

  useEffect(load, []);

  async function toggle(method: ShippingMethod, active: boolean) {
    setBusy(true);
    try {
      await api.updateShippingMethod(method.id, { active });
      toast.success(active ? 'روش ارسال فعال شد.' : 'روش ارسال غیرفعال شد.');
      load();
    } catch (problem) {
      toast.error('تغییر وضعیت انجام نشد', problem instanceof ApiError ? problem.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  async function remove(method: ShippingMethod) {
    setBusy(true);
    try {
      await api.deleteShippingMethod(method.id);
      toast.success('روش ارسال حذف شد.');
      load();
    } catch (problem) {
      toast.error('حذف انجام نشد', problem instanceof ApiError ? problem.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <div className="card-head">
        <div className="row" style={{ gap: 10 }}>
          <span className="stat-ico"><IconSettings size={15} /></span>
          <div>
            <div className="card-title">روش‌های ارسال</div>
            <div className="card-desc">هزینه ارسال جزئی از جمع سفارش است و فقط سمت سرور محاسبه می‌شود؛ اولین روش فعال، پیش‌فرض است.</div>
          </div>
        </div>
        <span className="card-index num">۰۴</span>
      </div>
      <div className="card-body" style={{ display: 'grid', gap: 14 }}>
        {methods === null && <SkeletonBlock height={60} />}
        {methods !== null && methods.length === 0 && (
          <div className="alert alert-info">
            <IconAlertCircle />
            <span>هنوز روش ارسالی تعریف نشده؛ سفارش‌ها بدون هزینه ارسال ثبت می‌شوند. برای محاسبه‌ی خودکار، دست‌کم یک روش (مثلاً «پست پیشتاز — ۴۵٬۰۰۰ تومان») اضافه کنید.</span>
          </div>
        )}
        {methods?.map(method => (
          <div key={method.id} className="row-between" style={{ border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px' }}>
            <div>
              <div className="strong" style={{ fontSize: 'var(--fs-sm)' }}>{method.name}</div>
              <div className="small muted">
                {SHIPPING_KINDS.find(kind => kind.value === method.kind)?.label ?? method.kind}
                {method.kind !== 'PICKUP' && ` · ${method.baseCost.toLocaleString('fa-IR')} تومان`}
                {method.kind === 'FREE_OVER' && method.freeOver != null && ` · رایگان بالای ${method.freeOver.toLocaleString('fa-IR')} تومان`}
                {method.kind === 'TABLE' && ` · ${Object.keys(method.rulesJson ?? {}).length} قاعده`}
              </div>
            </div>
            <div className="row" style={{ gap: 6 }}>
              <Switch label="فعال" checked={method.active} onChange={next => void toggle(method, next)} />
              <button className="btn btn-outline btn-sm" disabled={busy} onClick={() => setEditing(method)}>ویرایش</button>
              <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void remove(method)} style={{ color: 'var(--danger)' }}>حذف</button>
            </div>
          </div>
        ))}
        <button className="btn btn-outline btn-sm" onClick={() => setEditing('new')}>
          + افزودن روش ارسال
        </button>
      </div>

      {editing && (
        <ShippingMethodModal
          method={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </section>
  );
}

function ShippingMethodModal({ method, onClose, onSaved }: { method: ShippingMethod | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<ShippingMethod['kind']>(method?.kind ?? 'FIXED');
  const [rulesText, setRulesText] = useState(() =>
    method?.kind === 'TABLE'
      ? Object.entries(method.rulesJson ?? {}).map(([key, value]) => `${key}: ${value}`).join('\n')
      : '',
  );

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const baseCost = Number(data.get('baseCost') ?? 0);
    const freeOverRaw = String(data.get('freeOver') ?? '').trim();
    let rules: Record<string, number> | undefined;
    if (kind === 'TABLE') {
      rules = {};
      for (const line of rulesText.split('\n')) {
        const [key, value] = line.split(':').map(part => part.trim());
        if (key && value) rules[key] = Number(value);
      }
    }
    const body = {
      name: String(data.get('name') ?? '').trim(),
      kind,
      baseCost: kind === 'PICKUP' ? 0 : baseCost,
      freeOver: kind === 'FREE_OVER' ? (freeOverRaw === '' ? null : Number(freeOverRaw)) : null,
      rules,
    };
    setBusy(true);
    try {
      if (method) {
        await api.updateShippingMethod(method.id, body);
        toast.success('روش ارسال به‌روزرسانی شد.');
      } else {
        await api.createShippingMethod(body);
        toast.success('روش ارسال اضافه شد.');
      }
      onSaved();
    } catch (problem) {
      toast.error('ذخیره انجام نشد', problem instanceof ApiError ? problem.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  const kindInfo = SHIPPING_KINDS.find(item => item.value === kind);

  return (
    <Modal
      open onClose={onClose} title={method ? 'ویرایش روش ارسال' : 'روش ارسال جدید'}
      description="هزینه ارسال همیشه سمت سرور محاسبه می‌شود و در جمع سفارش نمایش داده می‌شود."
      footer={<><button className="btn btn-ghost" onClick={onClose}>انصراف</button><button className="btn btn-primary" form="sm-form" disabled={busy}>{busy && <Spinner size={14} />}ذخیره</button></>}
    >
      <form id="sm-form" onSubmit={submit} style={{ display: 'grid', gap: 14 }}>
        <Field label="نام روش" required htmlFor="sm-name">
          <input id="sm-name" name="name" className="input" required maxLength={200} defaultValue={method?.name ?? ''} placeholder="پست پیشتاز، پیک تهران، برداشت حضوری…" autoFocus />
        </Field>
        <Field label="نوع قانون" htmlFor="sm-kind" hint={kindInfo?.hint}>
          <select id="sm-kind" className="select" value={kind} onChange={event => setKind(event.target.value as ShippingMethod['kind'])}>
            {SHIPPING_KINDS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </Field>
        {kind !== 'PICKUP' && (
          <Field label="مبلغ پایه (تومان)" required htmlFor="baseCost">
            <input id="baseCost" name="baseCost" className="input input-ltr" type="number" min={0} max={2147483647} required defaultValue={method?.baseCost ?? 45000} />
          </Field>
        )}
        {kind === 'FREE_OVER' && (
          <Field label="آستانه‌ی رایگان‌شدن (تومان)" htmlFor="freeOver" hint="اگر جمع اقلام به این مبلغ برسد، ارسال رایگان می‌شود.">
            <input id="freeOver" name="freeOver" className="input input-ltr" type="number" min={0} max={2147483647} defaultValue={method?.freeOver ?? ''} placeholder="2000000" />
          </Field>
        )}
        {kind === 'TABLE' && (
          <Field label="قواعد استانی/شهری" htmlFor="rules" hint="هر خط: استان یا استان/شهر، دو نقطه، مبلغ. کلید * برای بقیه‌ی مقصدها.">
            <textarea id="rules" className="textarea mono" rows={5} value={rulesText} onChange={event => setRulesText(event.target.value)} placeholder={'تهران: 45000\nتهران/شهریار: 60000\n*: 80000'} />
          </Field>
        )}
      </form>
    </Modal>
  );
}
