'use client';

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { adminApi, AdminError, type AdminIdentity } from '@/lib/admin';
import { Field, Spinner, useToast } from '@/components/ui';
import { IconAlertCircle, IconCheck, IconInfo, IconShield } from '@/components/icons';

export default function AdminAccountPage() {
  const toast = useToast();
  const [me, setMe] = useState<AdminIdentity | null>(null);
  const [form, setForm] = useState({ current: '', next: '', repeat: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { adminApi.me().then(setMe).catch(() => setMe(null)); }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (form.next !== form.repeat) { setError('رمز تازه و تکرارش یکسان نیستند.'); return; }
    if (form.next.length < 10) { setError('رمز تازه باید حداقل ۱۰ کاراکتر باشد.'); return; }
    setBusy(true);
    try {
      await adminApi.changePassword(form.current, form.next);
      setForm({ current: '', next: '', repeat: '' });
      toast.success('رمز عوض شد', 'از این پس با رمز تازه وارد شوید.');
    } catch (problem) {
      const message = problem instanceof AdminError ? problem.message : 'تغییر رمز انجام نشد.';
      setError(message);
      toast.error('تغییر نکرد', message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid g-2" style={{ gap: 14 }}>
      <section className="card card-pad" style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
        <div className="row" style={{ gap: 10 }}>
          <span className="stat-ico"><IconShield size={15} /></span>
          <div>
            <div className="card-title" style={{ margin: 0 }}>هویت ادمین</div>
            <div className="card-desc">این حساب فقط به همین پنل دسترسی دارد، نه به داده‌ی فروشگاه‌ها</div>
          </div>
        </div>

        <div className="kv">
          <div className="kv-row"><span className="kv-k">نام</span><span className="kv-v">{me?.name || '—'}</span></div>
          <div className="kv-row"><span className="kv-k">ایمیل</span><span className="kv-v" style={{ direction: 'ltr', textAlign: 'right' }}>{me?.email ?? '—'}</span></div>
          <div className="kv-row"><span className="kv-k">آخرین ورود</span><span className="kv-v">{me?.lastLoginAt ? new Date(me.lastLoginAt).toLocaleString('fa-IR') : '—'}</span></div>
          <div className="kv-row"><span className="kv-k">ساخت حساب</span><span className="kv-v">{me?.createdAt ? new Date(me.createdAt).toLocaleDateString('fa-IR') : '—'}</span></div>
        </div>

        <div className="adm-note">
          <IconInfo size={16} />
          <span>
            اگر دسترسی را از دست دادید، در متغیرهای محیطی سرور <b className="num">ADMIN_EMAIL</b> و
            <b className="num"> ADMIN_PASSWORD</b> را ست کنید و سرویس را ری‌استارت کنید؛ در بالا آمدن بعدی،
            اگر آن ایمیل وجود نداشته باشد ساخته می‌شود. رمز فعلی روی صفحه نمایش داده نمی‌شود چون فقط هش ذخیره می‌شود.
          </span>
        </div>
      </section>

      <section className="card card-pad" style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
        <div className="row" style={{ gap: 10 }}>
          <span className="stat-ico"><IconCheck size={15} /></span>
          <div>
            <div className="card-title" style={{ margin: 0 }}>تغییر رمز</div>
            <div className="card-desc">پس از تغییر، نشست فعلی معتبر می‌ماند و بقیه‌ها تا ۸ ساعت منقضی می‌شوند</div>
          </div>
        </div>

        {error && <div className="adm-note bad"><IconAlertCircle size={16} /><span>{error}</span></div>}

        <form onSubmit={submit} className="stack" style={{ gap: 12 }}>
          <Field label="رمز فعلی" htmlFor="cur">
            <input id="cur" className="input input-ltr" type="password" dir="ltr" value={form.current} onChange={event => setForm({ ...form, current: event.target.value })} required autoComplete="current-password" />
          </Field>
          <Field label="رمز تازه" htmlFor="new" hint="حداقل ۱۰ کاراکتر؛ از حروف و عدد ترکیبی استفاده کنید.">
            <input id="new" className="input input-ltr" type="password" dir="ltr" value={form.next} onChange={event => setForm({ ...form, next: event.target.value })} required autoComplete="new-password" />
          </Field>
          <Field label="تکرار رمز تازه" htmlFor="rep">
            <input id="rep" className="input input-ltr" type="password" dir="ltr" value={form.repeat} onChange={event => setForm({ ...form, repeat: event.target.value })} required autoComplete="new-password" />
          </Field>
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? <Spinner size={14} /> : <IconCheck size={14} />}
            ذخیره‌ی رمز تازه
          </button>
        </form>
      </section>
    </div>
  );
}
