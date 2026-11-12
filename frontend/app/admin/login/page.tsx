'use client';

import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { adminApi, adminToken, AdminError } from '@/lib/admin';
import { Field, Spinner } from '@/components/ui';
import Link from 'next/link';
import { ThemeToggle } from '@/components/theme';
import { IconAlertCircle, IconArrowLeft, IconCheckCircle, IconEye, IconShield } from '@/components/icons';

const CHECKS = [
  { label: 'مدل زبانی و کلید API', key: 'MODEL' },
  { label: 'توکن ربات و webhook', key: 'BOT' },
  { label: 'اتصال PostgreSQL و مهاجرت‌ها', key: 'DATABASE' },
  { label: 'درگاه پرداخت و حالت آزمایشی', key: 'PAY GATEWAY' },
];

/**
 * ورود ادمین — جدا از ورود فروشنده.
 *
 * توکن ادمین در کلید دیگری ذخیره می‌شود (`forooshyar.admin`) تا ورود به این
 * صفحه، نشست پنل فروشنده را در همان مرورگر از بین نبرد.
 */
export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (adminToken.get()) adminApi.me().then(() => router.replace('/admin')).catch(() => adminToken.clear());
    window.setTimeout(() => emailRef.current?.focus(), 300);
  }, [router]);

  const [mustChange, setMustChange] = useState(false);
  const [newPassword, setNewPassword] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await adminApi.login(email.trim(), password);
      adminToken.set(result.accessToken);
      // حساب seedشده باید در اولین ورود رمز را عوض کند.
      if (result.mustChangePassword) {
        setMustChange(true);
        setPassword('');
        return;
      }
      router.replace('/admin');
    } catch (problem) {
      setError(problem instanceof AdminError ? problem.message : 'ارتباط با سرور برقرار نشد.');
    } finally {
      setBusy(false);
    }
  }

  async function submitNewPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (newPassword.length < 12) {
      setError('رمز تازه باید دست‌کم ۱۲ کاراکتر باشد.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await adminApi.changePassword(password, newPassword);
      router.replace('/admin');
    } catch (problem) {
      setError(problem instanceof AdminError ? problem.message : 'تغییر رمز انجام نشد.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="adm-login">
      <div className="authx-page-tools"><Link href="/" className="authx-home" aria-label="رفتن به صفحهٔ اصلی سایت"><span>صفحهٔ اصلی</span></Link><ThemeToggle /></div>
      <aside className="adm-login-side">
        <div className="adm-brand" style={{ borderBottom: '1px solid rgba(255,255,255,0.12)', paddingBottom: 16 }}>
          <span className="glyph"><IconShield size={19} /></span>
          <div>
            <div className="nm">فروش‌یار</div>
            <div className="rl">CONTROL ROOM</div>
          </div>
        </div>

        <h2>
          یک جا برای همه‌ی
          <br />
          <em>تنظیمات حساس</em> سامانه.
        </h2>
        <p>
          مدل زبانی، توکن ربات، اتصال دیتابیس و درگاه پرداخت — همه از همین پنل، بدون دست‌زدن
          به فایل‌های سرور. هر تغییر با نام شما در دفتر گردش ثبت می‌شود.
        </p>

        <div className="adm-checks">
          {CHECKS.map(check => (
            <div className="adm-check" key={check.key}>
              <span className="ico"><IconCheckCircle size={14} /></span>
              <span>{check.label}</span>
              <span className="mono">{check.key}</span>
            </div>
          ))}
        </div>
      </aside>

      <div className="adm-login-form">
        {mustChange ? (
          <form className="adm-login-card" onSubmit={submitNewPassword}>
            <div className="authx-brand" style={{ color: 'var(--ink)' }}>
              <span className="mark" style={{ background: 'var(--brand-50)', color: 'var(--brand)' }}>
                <IconShield size={16} />
              </span>
              <div>
                <div className="name" style={{ fontSize: 15 }}>تغییر رمز اجباری</div>
                <div className="role" style={{ color: 'var(--ink-3)' }}>حساب تازه ساخته شده است</div>
              </div>
            </div>

            <div>
              <h1>رمز تازه انتخاب کنید</h1>
              <p className="sub">برای امنیت، رمز موقت را با یک رمز قوی جایگزین کنید. رمز تازه دست‌کم ۱۲ کاراکتر باشد.</p>
            </div>

            {error && (
              <div className="alert alert-error" role="alert">
                <IconAlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}

            <Field label="رمز فعلی (موقت)" htmlFor="admin-current">
              <input
                id="admin-current" className="input input-ltr" type="password" value={password}
                onChange={event => setPassword(event.target.value)} autoComplete="current-password" required dir="ltr"
              />
            </Field>

            <Field label="رمز تازه" htmlFor="admin-new">
              <input
                id="admin-new" className="input input-ltr" type="password" value={newPassword}
                onChange={event => setNewPassword(event.target.value)} autoComplete="new-password" required dir="ltr"
                minLength={12}
              />
            </Field>

            <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={busy}>
              {busy ? <Spinner size={16} /> : <IconArrowLeft size={16} />}
              ذخیره و ورود به اتاق کنترل
            </button>
          </form>
        ) : (
        <form className="adm-login-card" onSubmit={submit}>
          <div className="authx-brand" style={{ color: 'var(--ink)' }}>
            <span className="mark" style={{ background: 'var(--brand-50)', color: 'var(--brand)' }}>
              <IconShield size={16} />
            </span>
            <div>
              <div className="name" style={{ fontSize: 15 }}>ورود مدیر سامانه</div>
              <div className="role" style={{ color: 'var(--ink-3)' }}>دسترسی به تنظیمات پلتفرم</div>
            </div>
          </div>

          <div>
            <h1>خوش آمدید</h1>
            <p className="sub">با ایمیل ادمین وارد شوید. این حساب با حساب فروشنده‌ها تفاوت دارد.</p>
          </div>

          {error && (
            <div className="alert alert-error" role="alert">
              <IconAlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          <Field label="ایمیل ادمین" htmlFor="admin-email">
            <input
              id="admin-email" ref={emailRef} className="input input-ltr" type="email" value={email}
              onChange={event => setEmail(event.target.value)} placeholder="admin@example.com"
              autoComplete="username" required dir="ltr"
            />
          </Field>

          <Field label="رمز عبور" htmlFor="admin-password">
            <div className="input-wrap">
              <input
                id="admin-password" className="input input-ltr" type={reveal ? 'text' : 'password'} value={password}
                onChange={event => setPassword(event.target.value)} placeholder="••••••••"
                autoComplete="current-password" required dir="ltr" style={{ paddingInlineStart: 42 }}
              />
              <button
                type="button" className="input-reveal" onClick={() => setReveal(value => !value)}
                aria-label={reveal ? 'پنهان‌کردن رمز' : 'نمایش رمز'}
                aria-pressed={reveal} title={reveal ? 'پنهان‌کردن رمز' : 'نمایش رمز'}
              >
                <IconEye size={17} />
              </button>
            </div>
          </Field>

          <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={busy}>
            {busy ? <Spinner size={16} /> : <IconArrowLeft size={16} />}
            ورود به اتاق کنترل
          </button>

          <div className="small muted" style={{ textAlign: 'center', lineHeight: 2 }}>
            نشست ادمین ۸ ساعت اعتبار دارد. اگر رمز را گم کردید، مقدار
            <b> ADMIN_SEED_PASSWORD </b> را در متغیرهای محیطی سرور عوض کنید و سرویس را دوباره راه بیندازید.
          </div>
        </form>
        )}
      </div>
    </div>
  );
}
