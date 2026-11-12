'use client';

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { api, request, ApiError, type PaymentMethod, type ReceiptPolicy, type ShippingMethod, type Shop } from '@/lib/api';
import { Field, Modal, PageHeader, SkeletonBlock, Spinner, Switch, useToast } from '@/components/ui';
import { IconAlertCircle, IconCheckCircle, IconChat, IconSettings, IconStore } from '@/components/icons';

/**
 * تنظیمات فروشگاه — فقط هفت بخش:
 *  ۱) هویت فروشگاه  ۲) تکمیل پروفایل  ۳) شماره کارت  ۴) روش‌های ارسال
 *  ۵) ارسال پیامک  ۶) اعلان پیامکی سفارش  ۷) پیش‌نمایش پاسخ
 *
 * بقیه‌ی چیزها (اشتراک، کانال‌ها، اتوماسیون، اعتبار AI، اطلاعات پاسخ‌گویی)
 * در منوهای خودشان زندگی می‌کنند: داشبورد، اکانت‌ها، اتوماسیون، دستیار.
 */

const NAV = [
  { id: 'identity', label: 'هویت فروشگاه' },
  { id: 'completeness', label: 'تکمیل پروفایل' },
  { id: 'cards', label: 'شماره کارت' },
  { id: 'shipping', label: 'روش‌های ارسال' },
  { id: 'sms', label: 'ارسال پیامک' },
  { id: 'order-sms', label: 'اعلان پیامکی سفارش' },
  { id: 'preview', label: 'پیش‌نمایش پاسخ' },
];

export default function SettingsPage() {
  const { shop, reloadShop } = useAuth();
  const toast = useToast();
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [smsEnabled, setSmsEnabled] = useState(true);
  const [smsPhone, setSmsPhone] = useState('');
  const [smsCode, setSmsCode] = useState('');
  const [smsOtpSent, setSmsOtpSent] = useState(false);
  const [notifySellerSms, setNotifySellerSms] = useState(true);
  const [form, setForm] = useState<Pick<Shop, 'shipping' | 'payment' | 'workingHours' | 'returns' | 'handoffMessage' | 'tone'>>({
    shipping: '', payment: '', workingHours: '', returns: '', handoffMessage: '', tone: '',
  });

  useEffect(() => {
    let alive = true;
    api.shop()
      .then(data => {
        if (!alive) return;
        setName(data.name);
        setForm({ shipping: data.shipping, payment: data.payment, workingHours: data.workingHours, returns: data.returns ?? '', handoffMessage: data.handoffMessage, tone: data.tone });
        setSmsPhone(data.smsPhone ?? '');
        setNotifySellerSms(data.notifySellerBySms ?? true);
        setSmsEnabled(data.smsEnabled ?? true);
      })
      .catch(() => { if (alive) setError('دریافت تنظیمات انجام نشد.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  async function saveName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError('');
    try {
      await api.updateShop({ name: name.trim() });
      await reloadShop();
      toast.success('نام فروشگاه ذخیره شد.');
    } catch (problem) {
      const message = problem instanceof ApiError ? problem.message : 'ذخیره انجام نشد.';
      setError(message);
      toast.error('ذخیره انجام نشد', message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleSms(next: boolean) {
    setSmsEnabled(next);
    try {
      await api.updateShop({ smsEnabled: next });
      toast.success(next ? 'ارسال پیامک فعال شد.' : 'ارسال پیامک غیرفعال شد.');
    } catch (problem) {
      setSmsEnabled(!next);
      toast.error('تغییر وضعیت انجام نشد', problem instanceof ApiError ? problem.message : undefined);
    }
  }

  async function toggleNotify(next: boolean) {
    setNotifySellerSms(next);
    try {
      await api.updateShop({ notifySellerBySms: next });
    } catch {
      setNotifySellerSms(!next);
      toast.error('ذخیره انجام نشد.');
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

  // چک‌لیست تکمیل پروفایل: هر مورد یک لینک سریع به همان بخش/صفحه دارد.
  const checklist = [
    { label: 'نام فروشگاه', done: name.trim().length > 0, href: '#identity' },
    { label: 'اطلاعات پاسخ‌گویی (لحن، ارسال، ساعت کاری)', done: Boolean(form.tone.trim() && form.shipping.trim() && form.workingHours.trim()), href: '/app/assistant' },
    { label: 'شماره کارت برای پرداخت', done: true, href: '#cards' },
    { label: 'روش ارسال', done: true, href: '#shipping' },
    { label: 'شماره موبایل برای پیامک سفارش', done: smsPhone.trim().length > 0, href: '#order-sms' },
  ];
  const doneCount = checklist.filter(item => item.done).length;
  const percent = Math.round((doneCount / checklist.length) * 100);

  return (
    <div className="stack">
      <PageHeader
        eyebrow="پیکربندی"
        title="تنظیمات فروشگاه"
        description="هویت، پرداخت، ارسال و پیامک. اطلاعات پاسخ‌گویی دستیار در صفحه‌ی «دستیار پاسخ‌گو» است."
        actions={<Link href="/app/assistant" className="btn btn-outline"><IconChat size={16} />آزمایش پاسخ</Link>}
      />

      <nav className="settings-nav" aria-label="بخش‌های تنظیمات">
        {NAV.map(item => (
          <a key={item.id} href={`#${item.id}`}>{item.label}</a>
        ))}
      </nav>

      {/* ۱) هویت فروشگاه */}
      <section className="card" id="identity">
        <div className="card-head">
          <div className="row" style={{ gap: 10 }}>
            <span className="stat-ico"><IconStore size={15} /></span>
            <div>
              <div className="card-title">هویت فروشگاه</div>
              <div className="card-desc">نام فروشگاه در همه‌ی پاسخ‌ها و سفارش‌ها استفاده می‌شود.</div>
            </div>
          </div>
        </div>
        <form className="card-body" style={{ display: 'grid', gap: 14 }} onSubmit={saveName}>
          <Field label="نام فروشگاه" required htmlFor="name">
            <input id="name" className="input" required maxLength={200} value={name} onChange={event => setName(event.target.value)} />
          </Field>
          {error && <div className="alert alert-error"><IconAlertCircle /><span>{error}</span></div>}
          <div className="row-between">
            <span className="small muted">لحن و اطلاعات پاسخ‌گویی در «دستیار پاسخ‌گو» ویرایش می‌شود.</span>
            <button className="btn btn-primary" type="submit" disabled={busy}>
              {busy ? <Spinner size={15} /> : <IconCheckCircle size={16} />}
              ذخیره
            </button>
          </div>
        </form>
      </section>

      {/* ۲) تکمیل پروفایل */}
      <section className="card" id="completeness">
        <div className="card-head">
          <div className="row" style={{ gap: 10 }}>
            <span className="stat-ico"><IconCheckCircle size={15} /></span>
            <div>
              <div className="card-title">تکمیل پروفایل</div>
              <div className="card-desc">هر چه کامل‌تر، دستیار بیشتر بدون ارجاع پاسخ می‌دهد.</div>
            </div>
          </div>
          <span className="num" style={{ fontSize: 28, fontWeight: 300 }}>{percent}٪</span>
        </div>
        <div className="card-body" style={{ display: 'grid', gap: 10 }}>
          <div className="progress"><span style={{ width: `${percent}%` }} /></div>
          <ul style={{ display: 'grid', gap: 6, margin: 0, padding: 0, listStyle: 'none' }}>
            {checklist.map(item => (
              <li key={item.label} className="row-between" style={{ fontSize: 'var(--fs-sm)' }}>
                <span className={item.done ? '' : 'muted'}>{item.done ? '✓ ' : '○ '}{item.label}</span>
                {!item.done && <Link href={item.href} className="btn btn-outline btn-sm">تکمیل</Link>}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ۳) شماره کارت */}
      <PaymentMethodsSection />

      {/* ۴) روش‌های ارسال */}
      <ShippingMethodsSection />

      {/* ۵) ارسال پیامک */}
      <section className="card" id="sms">
        <div className="card-head">
          <div className="row" style={{ gap: 10 }}>
            <span className="stat-ico"><IconChat size={15} /></span>
            <div>
              <div className="card-title">ارسال پیامک</div>
              <div className="card-desc">پیامک‌های سفارش (تأیید پرداخت به مشتری و اطلاع به فروشنده) از همین‌جا کنترل می‌شود.</div>
            </div>
          </div>
        </div>
        <div className="card-body">
          <Switch
            label="ارسال پیامک برای این فروشگاه فعال است"
            checked={smsEnabled}
            onChange={next => void toggleSms(next)}
          />
          {!smsEnabled && (
            <p className="small muted" style={{ marginTop: 8 }}>
              با خاموش‌کردن این گزینه، هیچ پیامکی برای مشتریان یا شما ارسال نمی‌شود؛ سفارش‌ها در پنل و تلگرام همچنان ثبت می‌شوند.
            </p>
          )}
        </div>
      </section>

      {/* ۶) اعلان پیامکی سفارش */}
      <section className="card" id="order-sms">
        <div className="card-head">
          <div className="row" style={{ gap: 10 }}>
            <span className="stat-ico"><IconChat size={15} /></span>
            <div>
              <div className="card-title">اعلان پیامکی سفارش</div>
              <div className="card-desc">وقتی سفارش پرداخت شد، به شما پیامک می‌رسد (اختیاری).</div>
            </div>
          </div>
        </div>
        <div className="card-body" style={{ display: 'grid', gap: 14 }}>
          <p className="muted">برای دریافت پیامک فروشنده، شماره موبایل را با کد یک‌بارمصرف تأیید کنید. پیامک مشتری پس از پرداخت جداگانه ارسال می‌شود.</p>
          <Field label="شماره موبایل فروشنده" htmlFor="sellerSms">
            <input id="sellerSms" className="input input-ltr" dir="ltr" placeholder="09123456789" value={smsPhone} onChange={event => setSmsPhone(event.target.value)} />
          </Field>
          {smsOtpSent && (
            <Field label="کد تأیید" htmlFor="sellerSmsCode">
              <input id="sellerSmsCode" className="input input-ltr" dir="ltr" inputMode="numeric" maxLength={6} value={smsCode} onChange={event => setSmsCode(event.target.value)} />
            </Field>
          )}
          <div className="row">
            <button type="button" className="btn btn-outline" onClick={async () => { try { await request('/auth/phone/otp/request', { method: 'POST', body: { phone: smsPhone } }); setSmsOtpSent(true); toast.success('کد ارسال شد', 'درگاه فعلی Mock است.'); } catch (problem) { toast.error('ارسال نشد', problem instanceof Error ? problem.message : 'خطا'); } }}>
              {smsOtpSent ? 'ارسال دوباره کد' : 'تأیید شماره'}
            </button>
            {smsOtpSent && (
              <button type="button" className="btn btn-primary" onClick={async () => { try { await request('/auth/phone/otp/verify', { method: 'POST', body: { phone: smsPhone, code: smsCode } }); toast.success('شماره تأیید شد', 'شماره برای پیامک فروشنده ثبت شد.'); } catch (problem) { toast.error('تأیید نشد', problem instanceof Error ? problem.message : 'کد نامعتبر'); } }}>
                ثبت کد
              </button>
            )}
          </div>
          <label className="row"><input type="checkbox" checked={notifySellerSms} onChange={event => void toggleNotify(event.target.checked)} />ارسال پیامک سفارش برای من (اختیاری)</label>
        </div>
      </section>

      {/* ۷) پیش‌نمایش پاسخ */}
      <section className="card" id="preview">
        <div className="card-head"><div className="card-title">پیش‌نمایش پاسخ</div></div>
        <div className="card-body" style={{ paddingBlock: 6 }}>
          <div className="kv">
            <PreviewRow label="اگر بپرسند «ارسال چطوریه؟»" value={form.shipping} fallback="به فروشنده ارجاع داده می‌شود" />
            <PreviewRow label="اگر بپرسند «پرداخت چطوره؟»" value={form.payment} fallback="به فروشنده ارجاع داده می‌شود" />
            <PreviewRow label="اگر بپرسند «کی باز هستید؟»" value={form.workingHours} fallback="به فروشنده ارجاع داده می‌شود" />
            <PreviewRow label="اگر بپرسند «مرجوعی دارید؟»" value={form.returns} fallback="اول می‌پرسد، بعد ارجاع می‌دهد" />
          </div>
          <p className="small muted" style={{ marginTop: 10 }}>
            این متن‌ها در صفحه‌ی <Link href="/app/assistant">دستیار پاسخ‌گو</Link> ویرایش می‌شوند.
          </p>
        </div>
      </section>
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
    <section className="card" id="cards">
      <div className="card-head">
        <div className="row" style={{ gap: 10 }}>
          <span className="stat-ico"><IconSettings size={15} /></span>
          <div>
            <div className="card-title">شماره کارت (کارت‌به‌کارت)</div>
            <div className="card-desc">شماره کارت‌ها هنگام ثبت سفارش به مشتری نمایش داده می‌شوند. پرداخت مشتری همیشه کارت‌به‌کارت است.</div>
          </div>
        </div>
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
    <section className="card" id="shipping">
      <div className="card-head">
        <div className="row" style={{ gap: 10 }}>
          <span className="stat-ico"><IconSettings size={15} /></span>
          <div>
            <div className="card-title">روش‌های ارسال</div>
            <div className="card-desc">هزینه ارسال جزئی از جمع سفارش است و فقط سمت سرور محاسبه می‌شود؛ اولین روش فعال، پیش‌فرض است.</div>
          </div>
        </div>
      </div>
      <div className="card-body" style={{ display: 'grid', gap: 14 }}>
        {methods === null && <SkeletonBlock height={60} />}
        {methods !== null && methods.length === 0 && (
          <div className="alert alert-warn">
            <IconAlertCircle />
            <span>هنوز روش ارسالی تعریف نشده؛ سفارش‌ها بدون هزینه ارسال ثبت می‌شوند. برای محاسبه‌ی خودکار هزینه، دست‌کم یک روش (مثلاً پست پیشتاز — ۴۵٬۰۰۰ تومان) اضافه کنید.</span>
          </div>
        )}
        {methods?.map(method => (
          <div key={method.id} className="row-between" style={{ border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px' }}>
            <div>
              <div className="strong" style={{ fontSize: 'var(--fs-sm)' }}>{method.name}</div>
              <div className="small muted">{SHIPPING_KINDS.find(kind => kind.value === method.kind)?.label ?? method.kind} · {method.baseCost.toLocaleString('fa-IR')} تومان</div>
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

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const body = {
      name: String(data.get('name') ?? '').trim(),
      kind,
      baseCost: Number(data.get('baseCost') ?? 0),
      freeOver: data.get('freeOver') ? Number(data.get('freeOver')) : null,
      rules: String(data.get('rules') ?? '').trim()
        ? Object.fromEntries(String(data.get('rules')).split('\n').map(line => line.split('=').map(part => part.trim())).filter(([k, v]) => k && v && !Number.isNaN(Number(v))).map(([k, v]) => [k, Number(v)]))
        : {},
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

  return (
    <Modal
      open onClose={onClose} title={method ? 'ویرایش روش ارسال' : 'روش ارسال جدید'}
      description="هزینه ارسال همیشه سمت سرور محاسبه می‌شود و به جمع سفارش اضافه می‌شود."
      footer={<><button className="btn btn-ghost" onClick={onClose}>انصراف</button><button className="btn btn-primary" form="sm-form" disabled={busy}>{busy && <Spinner size={14} />}ذخیره</button></>}
    >
      <form id="sm-form" onSubmit={submit} style={{ display: 'grid', gap: 14 }}>
        <Field label="نام روش ارسال" required htmlFor="sm-name">
          <input id="sm-name" name="name" className="input" required maxLength={200} defaultValue={method?.name ?? ''} placeholder="پست پیشتاز" autoFocus />
        </Field>
        <Field label="نوع محاسبه" htmlFor="sm-kind">
          <select id="sm-kind" className="input" value={kind} onChange={event => setKind(event.target.value as ShippingMethod['kind'])}>
            {SHIPPING_KINDS.map(item => <option key={item.value} value={item.value}>{item.label} — {item.hint}</option>)}
          </select>
        </Field>
        <div className="grid g-2">
          <Field label="هزینه پایه (تومان)" required htmlFor="sm-cost">
            <input id="sm-cost" name="baseCost" className="input input-ltr" type="number" min={0} required defaultValue={method?.baseCost ?? 0} />
          </Field>
          <Field label="رایگان بالای (تومان)" htmlFor="sm-free" hint="خالی = بدون آستانه.">
            <input id="sm-free" name="freeOver" className="input input-ltr" type="number" min={0} defaultValue={method?.freeOver ?? ''} />
          </Field>
        </div>
        {kind === 'TABLE' && (
          <Field label="جدول هزینه‌ها" htmlFor="sm-rules" hint="هر خط: نام استان یا شهر = هزینه. کلید * برای بقیه‌ی مقصدها.">
            <textarea
              id="sm-rules" name="rules" className="textarea input-ltr" dir="ltr" rows={5}
              defaultValue={method?.rulesJson ? Object.entries(method.rulesJson).map(([k, v]) => `${k}=${v}`).join('\n') : ''}
              placeholder={'تهران=60000\n*=45000'}
            />
          </Field>
        )}
      </form>
    </Modal>
  );
}
