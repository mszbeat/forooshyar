'use client';

import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';
import { BrandMascot } from '@/components/brand-mascot';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import './../auth.css';
import { useAuth } from '@/lib/auth';
import { ApiError } from '@/lib/api';
import { request } from '@/lib/api';
import { Field, Spinner, useToast } from '@/components/ui';
import { ThemeToggle } from '@/components/theme';
import { IconAlertCircle, IconArrowLeft, IconCheck, IconEye, IconLogo, IconShield } from '@/components/icons';

/** اعتبارسنجی سمت کلاینت؛ پیام‌ها فارسی و برای کاربر نهایی نوشته شده‌اند. */
const loginSchema = z.object({
  email: z.string().trim().email('ایمیل معتبر وارد کنید.'),
  password: z.string().min(10, 'رمز عبور باید دست‌کم ۱۰ کاراکتر باشد.').max(128),
});
const registerSchema = z.object({
  shopName: z.string().trim().min(2, 'نام فروشگاه را وارد کنید.').max(200),
  email: z.string().trim().email('ایمیل معتبر وارد کنید.'),
  password: z.string().min(10, 'رمز عبور باید دست‌کم ۱۰ کاراکتر باشد.').max(128),
  terms: z.literal(true, { error: 'برای ساخت فروشگاه باید شرایط استفاده را بپذیرید.' }),
});

/** مقصد بعد از ورود؛ فقط مسیرهای داخلی مجاز است (جلوگیری از open-redirect). */
function safeNext(): string {
  if (typeof window === 'undefined') return '/app';
  const next = new URLSearchParams(window.location.search).get('next');
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/app';
}

/**
 * ورود و ثبت‌نام در یک صفحه.
 *
 * چیدمان: دو نیمه. در حالت ورود، فرم در نیمه‌ی راست و پنل روایت در نیمه‌ی چپ
 * است. زدن «ساخت فروشگاه» هر دو نیمه را با یک حرکت نرم جابه‌جا می‌کند: فرم به
 * چپ می‌رود و پنل طراحی به راست می‌آید. برگشتن به ورود، همان حرکت را برعکس
 * انجام می‌دهد تا کاربر حس «همان صفحه» داشته باشد، نه دو صفحه‌ی جدا.
 */
export default function LoginPage() {
  const router = useRouter();
  const { login, loginOtp, register, token, ready } = useAuth();
  const toast = useToast();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [remember, setRemember] = useState(false);
  const [loginMethod,setLoginMethod]=useState<'password'|'otp'>('password');
  const [otpPhone,setOtpPhone]=useState(''); const [otpCode,setOtpCode]=useState(''); const [otpSent,setOtpSent]=useState(false);
  const [values, setValues] = useState({ shopName: '', email: '', password: '' });
  const [terms, setTerms] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  // نمایش/پنهان‌سازی رمز؛ همان الگوی صفحهٔ ادمین تا رفتار کل سایت یکسان باشد.
  const [reveal, setReveal] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);

  // لینک‌های بیرونی (?mode=register) و ایمیل به‌خاطر‌سپرده‌شده.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('mode') === 'register') setMode('register');
    const saved = window.localStorage.getItem('forooshyar.rememberedEmail');
    if (saved) {
      setValues(previous => ({ ...previous, email: saved }));
      setRemember(true);
    }
    // دکمه‌های برگشت/جلو مرورگر هم حالت را همگام نگه می‌دارد.
    const onPop = () => {
      const next = new URLSearchParams(window.location.search).get('mode') === 'register' ? 'register' : 'login';
      setMode(next);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    if (ready && token) router.replace(safeNext());
  }, [ready, token, router]);

  const set = (key: keyof typeof values) => (event: { target: { value: string } }) => {
    setValues(previous => ({ ...previous, [key]: event.target.value }));
    setFieldErrors(previous => ({ ...previous, [key]: '' }));
  };

  function switchMode(next: 'login' | 'register') {
    if (next === mode) return;
    setMode(next);
    setError('');
    setFieldErrors({});
    setTerms(false);
    setValues(previous => ({ ...previous, shopName: '', password: '' }));
    // حالت در URL هم ثبت می‌شود تا رفرش/اشتراک‌گذاری همان حالت را بدهد.
    const params = new URLSearchParams(window.location.search);
    if (next === 'register') params.set('mode', 'register');
    else params.delete('mode');
    const query = params.toString();
    router.replace(query ? `/login?${query}` : '/login', { scroll: false });
    window.setTimeout(() => emailRef.current?.focus(), 240);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    // اعتبارسنجی قبل از ارسال؛ خطاها زیر هر فیلد نمایش داده می‌شوند.
    if (mode === 'login' && loginMethod === 'otp') {
      if (!/^\d{10,11}$/.test(otpPhone.trim())) { setError('شماره موبایل معتبر وارد کنید.'); return; }
      if (otpCode.trim().length !== 6) { setError('کد ۶ رقمی را کامل وارد کنید.'); return; }
    } else if (mode === 'register') {
      const parsed = registerSchema.safeParse({ ...values, terms });
      if (!parsed.success) {
        const errors: Record<string, string> = {};
        for (const issue of parsed.error.issues) {
          const key = String(issue.path[0] ?? 'form');
          if (!errors[key]) errors[key] = issue.message;
        }
        setFieldErrors(errors);
        return;
      }
    } else {
      const parsed = loginSchema.safeParse(values);
      if (!parsed.success) {
        const errors: Record<string, string> = {};
        for (const issue of parsed.error.issues) {
          const key = String(issue.path[0] ?? 'form');
          if (!errors[key]) errors[key] = issue.message;
        }
        setFieldErrors(errors);
        return;
      }
    }
    setBusy(true);
    try {
      if (mode === 'login' && loginMethod === 'otp') { await loginOtp(otpPhone,otpCode); router.replace(safeNext()); return; }
      if (mode === 'register') {
        await register(values.email.trim(), values.password, values.shopName.trim());
        toast.success('فروشگاه شما ساخته شد', 'حالا کاتالوگ را کامل کنید تا پاسخ خودکار آماده شود.');
      } else {
        await login(values.email.trim(), values.password);
      }
      if (remember) window.localStorage.setItem('forooshyar.rememberedEmail', values.email.trim());
      else window.localStorage.removeItem('forooshyar.rememberedEmail');
      router.replace(safeNext());
    } catch (problem) {
      const message = problem instanceof ApiError
        ? problem.status === 401 ? 'ایمیل یا رمز عبور درست نیست.'
          : problem.status === 409 ? 'این ایمیل قبلاً ثبت شده است. وارد شوید یا ایمیل دیگری بگذارید.'
          : problem.message
        : 'ارتباط با سرور برقرار نشد. اتصال شبکه را بررسی کنید.';
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  const isRegister = mode === 'register';

  return (
    <div className={`authx ${isRegister ? 'register' : 'login'}`}>
      <div className="authx-page-tools"><Link href="/" className="authx-home" aria-label="رفتن به صفحهٔ اصلی سایت"><IconLogo size={17} /><span>صفحهٔ اصلی</span></Link><ThemeToggle /></div>
      <span className="authx-seam" aria-hidden="true" />

      {/* نیمه‌ی روایت — با تغییر حالت جابه‌جا می‌شود */}
      <aside className="authx-visual" aria-hidden="true">
        <div className="authx-visual-card">
        <span className="authx-glow b" />
        <div className="authx-visual-inner">
          <div className="authx-brand">
            <span className="mark"><BrandMascot size={38} expression={isRegister ? 'wave' : 'smile'} /></span>
            <div>
              <div className="name">فروش‌یار</div>
              <div className="role">دستیار پاسخ‌گوی فروش</div>
            </div>
          </div>

          <div className="authx-copy" key={mode}>
            <span className="kick">{isRegister ? 'شروع در ۳ دقیقه' : 'خوش برگشتید'}</span>
            <h2>
              {isRegister ? (
                <>کاتالوگ را یک‌بار وارد کنید؛<br />پاسخ‌دادن را <em>همیشه</em> ما انجام می‌دهیم.</>
              ) : (
                <>کاتالوگ‌تان را دقیق نگه دارید،<br />قیمت را ما <em>اشتباه</em> نمی‌گوییم.</>
              )}
            </h2>
            <p>
              {isRegister
                ? 'محصول و موجودی را وارد کنید، ارسال و ساعت کاری را بنویسید. از همان لحظه، هر سؤال قیمت و موجودی از دیتابیس خودتان جواب می‌گیرد.'
                : 'هر پاسخ از کاتالوگ زنده‌ی فروشگاه شما ساخته می‌شود؛ نه از حافظه‌ی مدل و نه از حدس.'}
            </p>

            <div className="authx-feats">
              <div className="authx-feat">
                <span className="tick"><IconCheck size={12} /></span>
                <span><b>قیمت و موجودی</b> همیشه از کاتالوگ خودتان خوانده می‌شود، نه از حافظه‌ی مدل.</span>
              </div>
              <div className="authx-feat">
                <span className="tick"><IconCheck size={12} /></span>
                <span><b>سفارش در همان گفتگو</b> ثبت می‌شود؛ نشانی، سایز و پرداخت مرحله‌به‌مرحله.</span>
              </div>
              <div className="authx-feat">
                <span className="tick"><IconCheck size={12} /></span>
                <span>سؤال مبهم یا شکایت، <b>به شما ارجاع</b> داده می‌شود — بات حدس نمی‌زند.</span>
              </div>
            </div>

            <div className="authx-chat">
              <div className="authx-bubble in">قیمت کفش راحتی چرم مردانه چنده؟ سایز ۴۰ دارید؟</div>
              <div className="authx-bubble out">
                <b>۶۴۰٬۰۰۰ تومان</b> · سایز ۴۰ موجود است ✅
                <br />
                برای ثبت سفارش همین‌جا بگویید.
              </div>
            </div>
          </div>

          <div className="authx-foot">
            <span className="dot" />
            کاتالوگ، موجودی و سفارش‌ها روی سرور خودتان می‌ماند.
          </div>
        </div>
        </div>
      </aside>

      {/* نیمه‌ی فرم */}
      <div className="authx-form-side">
        <div className="authx-form-card">
          <div className="authx-tabs" role="tablist" aria-label="ورود یا ثبت‌نام">
            <span className="thumb" aria-hidden="true" />
            <button
              type="button" role="tab" aria-selected={!isRegister}
              onClick={() => switchMode('login')}
            >
              ورود
            </button>
            <button
              type="button" role="tab" aria-selected={isRegister}
              onClick={() => switchMode('register')}
            >
              ثبت‌نام
            </button>
          </div>

          <div className="authx-pane" key={mode}>
            <div className="authx-head">
              <h1>{isRegister ? 'ساخت حساب فروشنده' : 'ورود به پنل فروشنده'}</h1>
              <p>
                {isRegister
                  ? 'نام فروشگاه همان چیزی است که مشتری در پاسخ‌ها می‌بیند. بعد از ساخت، محصول اضافه کنید.'
                  : 'برای مدیریت کاتالوگ، موجودی و پاسخ‌های خودکار وارد شوید.'}
              </p>
            </div>

            {error && (
              <div className="alert alert-error" role="alert" style={{ marginTop: 18 }}>
                <IconAlertCircle />
                <span>{error}</span>
              </div>
            )}

            <form className="authx-form" onSubmit={submit} noValidate={false}>
              {isRegister && (
                <Field label="نام فروشگاه" required htmlFor="shopName" hint="همین نام در پاسخ خودکار خطاب به مشتری استفاده می‌شود." error={fieldErrors.shopName}>
                  <input
                    id="shopName" className="input" name="shopName" required maxLength={200}
                    placeholder="مثلاً بوتیک نیلا" value={values.shopName} onChange={set('shopName')}
                    autoComplete="organization" aria-invalid={Boolean(fieldErrors.shopName)}
                  />
                </Field>
              )}

              {!isRegister && <div className="authx-row"><button type="button" className="authx-link" onClick={()=>setLoginMethod('password')}>ورود با ایمیل و رمز</button><button type="button" className="authx-link" onClick={()=>setLoginMethod('otp')}>ورود با کد یک‌بارمصرف</button></div>}
              {!isRegister && loginMethod === 'otp' ? <>
                <Field label="شماره موبایل تأییدشده" required htmlFor="otpPhone"><input id="otpPhone" className="input input-ltr" dir="ltr" value={otpPhone} onChange={e=>setOtpPhone(e.target.value)} placeholder="09123456789" /></Field>
                {otpSent && <Field label="کد یک‌بارمصرف" required htmlFor="otpCode"><input id="otpCode" className="input input-ltr" dir="ltr" inputMode="numeric" maxLength={6} value={otpCode} onChange={e=>setOtpCode(e.target.value)} /></Field>}
                {!otpSent && <button type="button" className="btn btn-outline" disabled={busy||!otpPhone} onClick={async()=>{setBusy(true);try{await request('/auth/otp/request',{method:'POST',body:{phone:otpPhone},auth:false});setOtpSent(true);setError('در صورت تأیید بودن شماره، کد ارسال شد.');}catch(e){setError(e instanceof Error?e.message:'درخواست کد انجام نشد.');}finally{setBusy(false);}}}>ارسال کد</button>}
              </> : <>
              <Field label="ایمیل" required htmlFor="email" error={fieldErrors.email}>
                <input
                  id="email" ref={emailRef} className="input input-ltr" name="email" type="email" required
                  placeholder="you@shop.ir" value={values.email} onChange={set('email')}
                  autoComplete="username" dir="ltr" aria-invalid={Boolean(fieldErrors.email)}
                />
              </Field>

              <Field
                label="رمز عبور" required htmlFor="password"
                hint={isRegister ? 'حداقل ۱۰ کاراکتر؛ ترکیب حرف و رقم امن‌تر است.' : undefined}
                error={fieldErrors.password}
              >
                <div className="input-wrap">
                  <input
                    id="password" className="input input-ltr" name="password" type={reveal ? 'text' : 'password'} required
                    minLength={10} maxLength={128} placeholder="••••••••••"
                    value={values.password} onChange={set('password')}
                    autoComplete={isRegister ? 'new-password' : 'current-password'} dir="ltr"
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

              </>}

              {isRegister && (
                <div>
                  <label className="authx-check">
                    <input
                      type="checkbox" checked={terms}
                      onChange={event => { setTerms(event.target.checked); setFieldErrors(previous => ({ ...previous, terms: '' })); }}
                      aria-invalid={Boolean(fieldErrors.terms)}
                    />
                    <span>
                      <Link href="/terms" target="_blank" rel="noreferrer">شرایط استفاده</Link>
                      {' '}و{' '}
                      <Link href="/privacy" target="_blank" rel="noreferrer">حریم خصوصی</Link>
                      {' '}فروش‌یار را می‌پذیرم.
                    </span>
                  </label>
                  {fieldErrors.terms && <div className="authx-terms-error" role="alert">{fieldErrors.terms}</div>}
                </div>
              )}

              {loginMethod !== 'otp' || isRegister ? <div className="authx-row">
                <label className="authx-check">
                  <input type="checkbox" checked={remember} onChange={event => setRemember(event.target.checked)} />
                  ایمیل من را به خاطر بسپار
                </label>
                <button type="button" className="authx-link" onClick={() => switchMode(isRegister ? 'login' : 'register')}>
                  {isRegister ? 'حساب دارم، وارد شوم' : 'حساب ندارم، بسازم'}
                </button>
              </div> : null}

              {(!isRegister && loginMethod === 'otp' && otpSent) ? <button className="btn btn-primary btn-lg btn-block" disabled={busy || otpCode.length!==6} type="submit">{busy?<Spinner/>:'ورود با کد'}</button> : (isRegister || loginMethod === 'password') && <button className="btn btn-primary btn-lg btn-block authx-submit" disabled={busy} type="submit">
                {busy ? <Spinner /> : null}
                {isRegister ? 'ساخت فروشگاه' : 'ورود به پنل'}
                {!busy && <IconArrowLeft size={17} />}
              </button>}
            </form>

            {isRegister ? (
              <p className="authx-note">
                <IconShield size={13} style={{ verticalAlign: '-2px', marginInlineEnd: 4 }} />
                هر تغییری در موجودی و هر سفارش در دفتر گردش ثبت می‌شود.
              </p>
            ) : (
              <div className="authx-demo">
                <strong>حساب نمایشی:</strong>
                <code>demo@forooshyar.ir</code>
                <span>/</span>
                <code>forooshyar-demo-1404</code>
              </div>
            )}

            <Link href="/" className="authx-back">
              <IconArrowLeft size={14} style={{ transform: 'scaleX(-1)' }} />
              بازگشت به صفحه اصلی
            </Link>

            {/* ورود مدیر سامانه عمداً از اینجا هم قابل دسترسی است: آدرس /admin
                را کسی حدس نمی‌زند و پشتیبانی هم باید راه ورود داشته باشد. */}
            <Link
              href="/admin/login"
              className="authx-back"
              style={{ color: 'var(--ink-3)', fontSize: 12 }}
            >
              <IconShield size={13} />
              ورود مدیر سامانه
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
