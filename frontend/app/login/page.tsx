'use client';

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import './../landing.css';
import { useAuth } from '@/lib/auth';
import { ApiError } from '@/lib/api';
import { Field, Spinner, useToast } from '@/components/ui';
import { IconAlertCircle, IconArrowLeft, IconCheckCircle, IconLogo } from '@/components/icons';

export default function LoginPage() {
  const router = useRouter();
  const { login, register, token, ready } = useAuth();
  const toast = useToast();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [values, setValues] = useState({ shopName: '', email: '', password: '' });

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('mode') === 'register') setMode('register');
  }, []);

  useEffect(() => {
    if (ready && token) router.replace('/app');
  }, [ready, token, router]);

  const set = (key: keyof typeof values) => (event: { target: { value: string } }) =>
    setValues(previous => ({ ...previous, [key]: event.target.value }));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'register') {
        await register(values.email.trim(), values.password, values.shopName.trim());
        toast.success('فروشگاه شما ساخته شد', 'حالا کاتالوگ را کامل کنید تا پاسخ خودکار آماده شود.');
      } else {
        await login(values.email.trim(), values.password);
      }
      router.replace('/app');
    } catch (problem) {
      const message = problem instanceof ApiError
        ? problem.status === 401 ? 'ایمیل یا رمز عبور درست نیست.' : problem.status === 409 ? 'این ایمیل قبلاً ثبت شده است.' : problem.message
        : 'ارتباط با سرور برقرار نشد. اتصال شبکه را بررسی کنید.';
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-shell">
      <aside className="auth-side">
        <div className="brand">
          <span className="brand-mark" style={{ background: 'rgba(255,255,255,.14)', boxShadow: 'none', border: '1px solid rgba(255,255,255,.2)' }}>
            <IconLogo size={20} />
          </span>
          <div>
            <div className="brand-name">فروش‌یار</div>
            <div className="brand-sub">پنل فروشنده</div>
          </div>
        </div>

        <div>
          <h2>کاتالوگ‌تان را دقیق نگه دارید،<br />پاسخ‌دادن را به ما بسپارید.</h2>
          <ul className="auth-bullets">
            <li><IconCheckCircle size={17} /><span>قیمت و موجودی همیشه از دیتابیس خودتان خوانده می‌شود.</span></li>
            <li><IconCheckCircle size={17} /><span>هر فروش و اصلاح موجودی در دفتر گردش ثبت می‌شود.</span></li>
            <li><IconCheckCircle size={17} /><span>سؤال مبهم یا حساس مستقیم به شما ارجاع داده می‌شود.</span></li>
          </ul>
        </div>

        <p className="auth-quote">
          «قیمت اشتباه، بدترین چیزی است که یک بات فروش می‌تواند بگوید. ما این را از معماری حذف کردیم.»
        </p>
      </aside>

      <main className="auth-main">
        <div className="auth-card">
          <h1>{mode === 'register' ? 'ساخت فروشگاه جدید' : 'ورود به پنل'}</h1>
          <p className="lead">
            {mode === 'register'
              ? 'چند اطلاعات کوتاه؛ بعد از آن می‌توانید محصول اضافه کنید.'
              : 'برای مدیریت کاتالوگ، موجودی و پاسخ‌های خودکار وارد شوید.'}
          </p>

          {error && (
            <div className="alert alert-error" role="alert" style={{ marginBottom: 16 }}>
              <IconAlertCircle /><span>{error}</span>
            </div>
          )}

          <form className="auth-form" onSubmit={submit}>
            {mode === 'register' && (
              <Field label="نام فروشگاه" required htmlFor="shopName" hint="همین نام در پاسخ‌های خودکار استفاده می‌شود.">
                <input
                  id="shopName" className="input" name="shopName" required maxLength={200}
                  placeholder="مثلاً بوتیک نیلا" value={values.shopName} onChange={set('shopName')}
                  autoComplete="organization"
                />
              </Field>
            )}
            <Field label="ایمیل" required htmlFor="email">
              <input
                id="email" className="input input-ltr" name="email" type="email" required
                placeholder="you@shop.ir" value={values.email} onChange={set('email')}
                autoComplete="username" dir="ltr"
              />
            </Field>
            <Field
              label="رمز عبور" required htmlFor="password"
              hint={mode === 'register' ? 'حداقل ۱۰ کاراکتر.' : undefined}
            >
              <input
                id="password" className="input input-ltr" name="password" type="password" required
                minLength={10} maxLength={128} placeholder="••••••••••"
                value={values.password} onChange={set('password')}
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'} dir="ltr"
              />
            </Field>

            <button className="btn btn-primary btn-lg btn-block" disabled={busy} type="submit">
              {busy ? <Spinner /> : null}
              {mode === 'register' ? 'ساخت فروشگاه' : 'ورود'}
              {!busy && <IconArrowLeft size={17} />}
            </button>
          </form>

          <p className="auth-switch">
            {mode === 'register' ? 'قبلاً حساب دارید؟' : 'حساب ندارید؟'}
            <button type="button" onClick={() => { setMode(mode === 'register' ? 'login' : 'register'); setError(''); }}>
              {mode === 'register' ? 'وارد شوید' : 'فروشگاه بسازید'}
            </button>
          </p>

          {mode === 'login' && (
            <div className="auth-demo">
              <strong>حساب نمایشی: </strong>
              <code>demo@forooshyar.ir</code> / <code>forooshyar-demo-1404</code>
            </div>
          )}

          <p className="small muted center" style={{ marginTop: 18 }}>
            <Link href="/">← بازگشت به صفحه اصلی</Link>
          </p>
        </div>
      </main>
    </div>
  );
}
