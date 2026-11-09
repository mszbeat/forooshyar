'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, type InstagramStatus } from '@/lib/api';
import { SkeletonBlock, Spinner, useToast } from '@/components/ui';
import { IconAlertCircle, IconCheck, IconCheckCircle, IconCopy, IconInstagram, IconSend } from '@/components/icons';

/**
 * اتصال دایرکت اینستاگرام (BoxAPI).
 *
 * چرا این کارت این‌طور چیده شده: اتصال اینستاگرام یک «دکمه‌ی جادویی» نیست؛ سه
 * قطعه دارد که هر کدام جای خودش را دارد و بیشتر پشتیبانی‌ها هم از همین‌جا
 * می‌آید:
 *   ۱. توکن دسترسی روی سرور (env) — چیزی است که مدیر سیستم می‌گذارد.
 *   ۲. اتصال پیج در داشبورد BoxAPI — کاری است که فروشنده با لینک انجام می‌دهد.
 *   ۳. ثبت آدرس webhook — تنها قدمی که اگر جا بیفتد، پیام مشتری هرگز نمی‌رسد.
 * به‌جای توضیح متنی طولانی، همان سه قدم با وضعیت واقعی هرکدام نشان داده
 * می‌شود؛ فروشنده دقیقاً می‌بیند کدام قدم مانده است.
 *
 * توکن و سکرت هرگز در این صفحه نیستند — نه ماسک‌شده هم نه؛ فقط «ست شده / نشده».
 */
export function InstagramConnect() {
  const toast = useToast();
  const [status, setStatus] = useState<InstagramStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [recipient, setRecipient] = useState('');
  const [testNote, setTestNote] = useState('');

  const load = useCallback(async () => {
    try {
      setStatus(await api.instagramStatus());
      setError('');
    } catch {
      setError('وضعیت اتصال اینستاگرام دریافت نشد.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function copy(value: string, what: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success('کپی شد', what);
    } catch {
      toast.error('کپی نشد', 'متن را دستی انتخاب کنید.');
    }
  }

  async function sendTest() {
    setBusy(true);
    setTestNote('');
    try {
      const result = await api.instagramTest(recipient.trim());
      if (result.ok) {
        setTestNote('✅ پیام آزمایشی رفت؛ اگر در دایرکت نیامد، گفتگو را در همینستاگرام ببندید و باز کنید.');
        toast.success('ارسال شد', 'پیام آزمایشی به آن شناسه رفت.');
      } else {
        setTestNote(`⚠️ ${result.error ?? 'ارسال نشد.'}`);
        toast.error('ارسال نشد', result.error ?? 'خطای نامشخص');
      }
    } catch (problem) {
      const message = problem instanceof ApiError ? problem.message : 'ارسال آزمایشی انجام نشد.';
      setTestNote(`⚠️ ${message}`);
    } finally {
      setBusy(false);
      void load();
    }
  }

  if (loading) return <SkeletonBlock height={240} />;

  const steps = [
    {
      title: 'توکن دسترسی روی سرور',
      done: Boolean(status?.configured),
      body: status?.configured
        ? 'کلید API و شناسه‌ی پیج از متغیرهای محیطی سرور خوانده می‌شود.'
        : 'مدیر سیستم باید INSTAGRAM_API_KEY و INSTAGRAM_ACCOUNT_ID را در Environment سرویس API بگذارد و سرویس را ری‌استارت کند.',
    },
    {
      title: 'اتصال پیج اینستاگرام',
      done: Boolean(status?.accountLinked),
      body: status?.accountLinked
        ? `پیج وصل است${status?.accountId ? ` — حساب ${status.accountId}` : ''}.`
        : 'از داشبورد BoxAPI لینک اتصال را باز کنید و حساب اینستاگرام فروشگاه را اجازه بدهید.',
    },
    {
      title: 'ثبت آدرس webhook',
      done: false,
      body: 'این آدرس را در داشبورد BoxAPI، بخش Webhook، ذخیره کنید تا پیام مشتری به این سرور برسد.',
      showWebhook: true,
    },
  ];

  return (
    <section className="card">
      <div className="card-head">
        <div className="row" style={{ gap: 10 }}>
          <span className="stat-ico"><IconInstagram size={15} /></span>
          <div>
            <div className="card-title">دایرکت اینستاگرام</div>
            <div className="card-desc">
              مشتری در دایرکت سؤال می‌پرسد و دستیار با همین کاتالوگ و تنظیمات جواب می‌دهد؛ سفارش هم داخل دایرکت ثبت می‌شود.
            </div>
          </div>
        </div>
        <span className={`badge ${status?.configured ? 'b-green' : 'b-gray'}`}>
          <span className="dot" />
          {status?.configured ? 'فعال' : 'غیرفعال'}
        </span>
      </div>

      <div className="card-body" style={{ display: 'grid', gap: 18 }}>
        {!status?.configured && (
          <div className="alert alert-warn">
            <IconAlertCircle />
            <span>
              اتصال اینستاگرام هنوز روی سرور پیکربندی نشده است. مدیر سیستم باید
              <span className="mono"> INSTAGRAM_API_KEY </span>
              و
              <span className="mono"> INSTAGRAM_ACCOUNT_ID </span>
              (و برای امنیت،
              <span className="mono"> INSTAGRAM_WEBHOOK_SECRET</span>) را در Environment سرویس API بگذارد.
            </span>
          </div>
        )}

        {status?.configured && !status.signatureEnforced && (
          <div className="alert alert-warn">
            <IconAlertCircle />
            <span>
              <span className="mono">INSTAGRAM_WEBHOOK_SECRET</span> ست نشده، پس امضای webhook بررسی نمی‌شود.
              هر کسی که آدرس را بداند می‌تواند پیام جعلی بفرستد؛ این مقدار را در سرور تنظیم کنید.
            </span>
          </div>
        )}

        {/* ------------------------------------------------------------ مراحل */}
        <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 0 }}>
          {steps.map((step, index) => (
            <li
              key={step.title}
              style={{
                display: 'grid',
                gridTemplateColumns: '26px minmax(0,1fr)',
                gap: 12,
                paddingBlock: index === steps.length - 1 ? '0 2px' : 14,
                borderBottom: index === steps.length - 1 ? 'none' : '1px solid var(--line)',
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 26,
                  height: 26,
                  borderRadius: 999,
                  border: `1px solid ${step.done ? 'transparent' : 'var(--line)'}`,
                  background: step.done ? 'var(--green-soft, #e8f5ee)' : 'transparent',
                  color: step.done ? 'var(--green, #157347)' : 'var(--muted)',
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                {step.done ? <IconCheck size={14} /> : <span className="num">{['۱', '۲', '۳'][index]}</span>}
              </span>
              <div style={{ minWidth: 0 }}>
                <div className="row-between" style={{ gap: 8, alignItems: 'baseline' }}>
                  <span className="kv-k" style={{ fontWeight: 500 }}>{step.title}</span>
                  {step.done && <span className="small muted">انجام شد</span>}
                </div>
                <p className="small muted" style={{ margin: '4px 0 0', lineHeight: 1.95 }}>{step.body}</p>

                {step.showWebhook && (
                  <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                    {/* آدرس کامل و قابل‌شکستن؛ `input` در ستون باریک انتهای آدرس
                        را می‌بُرید و کاربر نمی‌فهمید آدرس کامل چه بود. */}
                    <code
                      dir="ltr"
                      aria-label="آدرس webhook اینستاگرام"
                      style={{
                        display: 'block',
                        padding: '10px 12px',
                        border: '1px solid var(--line)',
                        borderRadius: 10,
                        background: 'var(--surface-2, rgba(0,0,0,.02))',
                        fontSize: 12.5,
                        lineHeight: 1.8,
                        overflowWrap: 'anywhere',
                        wordBreak: 'break-all',
                        textAlign: 'left',
                      }}
                    >
                      {status?.webhookUrl || '—'}
                    </code>
                    <div>
                      <button
                        className="btn btn-outline btn-sm"
                        type="button"
                        disabled={!status?.webhookUrl}
                        onClick={() => copy(status?.webhookUrl ?? '', 'آدرس webhook کپی شد.')}
                      >
                        <IconCopy size={15} />
                        کپی آدرس
                      </button>
                    </div>
                    {!status?.webhookUrlIsHttps && (
                      <span className="small" style={{ color: 'var(--amber, #b45309)', lineHeight: 1.9 }}>
                        BoxAPI فقط آدرس <span className="mono">https</span> را می‌پذیرد. اگر سرور روی دامنه‌ی عمومی نیست،
                        ابتدا <span className="mono">PUBLIC_API_URL</span> را تنظیم کنید.
                      </span>
                    )}
                  </div>
                )}

                {index === 1 && status?.loginUrl && (
                  <a
                    className="btn btn-outline btn-sm"
                    style={{ marginTop: 10 }}
                    href={status.loginUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <IconInstagram size={15} />
                    باز کردن صفحه‌ی اتصال حساب
                  </a>
                )}
              </div>
            </li>
          ))}
        </ol>

        <div style={{ height: 1, background: 'var(--line)' }} />

        {/* --------------------------------------------------------- آزمایش */}
        <div>
          <div className="row-between" style={{ marginBottom: 8, gap: 10 }}>
            <div>
              <div className="kv-k">آزمایش اتصال</div>
              <p className="small muted" style={{ margin: '4px 0 0', lineHeight: 1.9 }}>
                شناسه‌ی گیرنده (IGSID) را از گفتگوهای همین پیج بردارید؛ پیام آزمایشی همان‌جا می‌رسد.
              </p>
            </div>
          </div>
          <div className="row" style={{ gap: 8, alignItems: 'stretch', flexWrap: 'wrap' }}>
            <input
              className="input mono"
              dir="ltr"
              inputMode="numeric"
              placeholder="17841400000000000"
              aria-label="شناسه‌ی گیرنده در دایرکت"
              value={recipient}
              onChange={event => setRecipient(event.target.value)}
            />
            <button
              className="btn btn-primary"
              type="button"
              disabled={busy || !status?.configured || !/^\d{5,32}$/u.test(recipient.trim())}
              onClick={sendTest}
            >
              {busy ? <Spinner size={15} /> : <IconSend size={15} />}
              ارسال آزمایشی
            </button>
          </div>
          {testNote && (
            <p className="small" style={{ margin: '8px 0 0', lineHeight: 1.9, color: testNote.startsWith('✅') ? 'var(--green, #157347)' : 'var(--amber, #b45309)' }}>
              {testNote}
            </p>
          )}
        </div>

        <div style={{ height: 1, background: 'var(--line)' }} />

        <div className="row-between" style={{ gap: 12, flexWrap: 'wrap' }}>
          <div className="row" style={{ gap: 18, flexWrap: 'wrap' }}>
            <span className="small muted">
              <span className="num">{status?.stats.conversations ?? 0}</span> گفتگوی اینستاگرام
            </span>
            <span className="small muted">
              <span className="num">{status?.stats.messages ?? 0}</span> پیام ردوبدل‌شده
            </span>
          </div>
          <span className="row small muted" style={{ gap: 6 }}>
            <IconCheckCircle size={14} />
            امضا {status?.signatureEnforced ? 'فعال' : 'غیرفعال'}
          </span>
        </div>

        {error && <div className="alert alert-error"><IconAlertCircle /><span>{error}</span></div>}
      </div>
    </section>
  );
}
