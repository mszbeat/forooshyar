'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, type InstagramAccount, type InstagramStatus } from '@/lib/api';
import { SkeletonBlock, Spinner, useToast } from '@/components/ui';
import {
  IconAlertCircle, IconCheck, IconCheckCircle, IconCopy, IconInstagram, IconRefresh, IconSend,
} from '@/components/icons';

/**
 * اتصال پیج اینستاگرامِ **همین فروشگاه** (BoxAPI).
 *
 * چرا این کارت دو حالت کاملاً متفاوت دارد: از دید فروشنده، «اینستاگرام» یعنی
 * پیج خودش. سرور فقط حساب باکس‌ای‌پی پلتفرم را دارد؛ پیج را فروشنده وصل می‌کند.
 * پس تا وقتی پیجی وصل نشده، کارت یک کار می‌خواهد: باز کردن لینک ورود و انتخاب
 * پیج. بعد از اتصال، همان کارت هویت پیج (نام کاربری، عکس، انقضای دسترسی) و
 * ابزار آزمایش را نشان می‌دهد.
 *
 * توکن و سکرت هرگز در این صفحه نیستند — نه ماسک‌شده هم نه؛ فقط «ست شده / نشده».
 */
export function InstagramConnect() {
  const toast = useToast();
  const [status, setStatus] = useState<InstagramStatus | null>(null);
  const [accounts, setAccounts] = useState<InstagramAccount[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'connect' | 'accounts' | 'link' | 'unlink' | 'test' | null>(null);
  const [error, setError] = useState('');
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

  /**
   * باز کردن صفحه‌ی اتصال حساب.
   *
   * لینک از سرور و با احراز هویت گرفته می‌شود (داخلش توکن ورود است، پس در
   * پاسخ `status` نیست). پنجره از قبل باز می‌شود تا پاپ‌آپ‌بلاکر مرورگر آن را
   * نبندد؛ بعد آدرس تزریق می‌شود.
   */
  async function openConnectLink() {
    const popup = window.open('', '_blank', 'noopener,width=520,height=720');
    setBusy('connect');
    try {
      const result = await api.instagramConnectUrl();
      if (!result.ok || !result.url) {
        popup?.close();
        setError(result.error ?? 'لینک ورود در دسترس نیست.');
        return;
      }
      if (popup) popup.location.href = result.url;
      else window.open(result.url, '_blank', 'noopener');
    } catch (problem) {
      popup?.close();
      setError(problem instanceof ApiError ? problem.message : 'لینک ورود در دسترس نیست.');
    } finally {
      setBusy(null);
    }
  }

  /** فهرست پیج‌ها را از BoxAPI می‌گیرد؛ نتیجه‌اش ربطی به «وصل‌شدن» ندارد. */
  async function refreshAccounts() {
    setBusy('accounts');
    setError('');
    setTestNote('');
    try {
      const result = await api.instagramAccounts();
      setAccounts(result.items);
      if (!result.ok) {
        setError(result.error ?? 'دریافت فهرست پیج‌ها انجام نشد.');
      } else if (result.items.length === 0) {
        toast.push('info', 'پیجی پیدا نشد', 'اول با لینک ورود، پیج فروشگاه را اجازه بدهید و بعد دوباره بررسی کنید.');
      }
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.message : 'دریافت فهرست پیج‌ها انجام نشد.');
    } finally {
      setBusy(null);
    }
  }

  async function link(account: InstagramAccount) {
    setBusy('link');
    setError('');
    try {
      const result = await api.instagramLink(account.id);
      if (!result.ok) {
        setError(result.error ?? 'اتصال پیج انجام نشد.');
        return;
      }
      toast.success('پیج وصل شد', `از این پس دایرکت‌های @${result.username ?? account.username} همین‌جا مدیریت می‌شود.`);
      setAccounts(null);
      await load();
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.message : 'اتصال پیج انجام نشد.');
    } finally {
      setBusy(null);
    }
  }

  async function unlink() {
    setBusy('unlink');
    setError('');
    try {
      const result = await api.instagramUnlink();
      if (!result.ok) {
        setError(result.error ?? 'قطع اتصال انجام نشد.');
        return;
      }
      toast.success('قطع شد', 'دایرکت‌ها دیگر به این فروشگاه نمی‌رسند؛ گفتگوها باقی می‌مانند.');
      await load();
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.message : 'قطع اتصال انجام نشد.');
    } finally {
      setBusy(null);
    }
  }

  async function copy(value: string, what: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success('کپی شد', what);
    } catch {
      toast.error('کپی نشد', 'متن را دستی انتخاب کنید.');
    }
  }

  async function sendTest() {
    setBusy('test');
    setTestNote('');
    try {
      const result = await api.instagramTest(recipient.trim());
      if (result.ok) {
        setTestNote('✅ پیام آزمایشی رفت؛ اگر در دایرکت نیامد، گفتگو را در اینستاگرام ببندید و باز کنید.');
        toast.success('ارسال شد', 'پیام آزمایشی به آن شناسه رفت.');
      } else {
        setTestNote(`⚠️ ${result.error ?? 'ارسال نشد.'}`);
      }
    } catch (problem) {
      setTestNote(`⚠️ ${problem instanceof ApiError ? problem.message : 'ارسال آزمایشی انجام نشد.'}`);
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <SkeletonBlock height={240} />;

  const account = status?.account ?? null;
  const expiringSoon = account?.daysLeft !== null && account?.daysLeft !== undefined && account.daysLeft <= 7;

  return (
    <section className="card">
      <div className="card-head">
        <div className="row" style={{ gap: 10 }}>
          <span className="stat-ico"><IconInstagram size={15} /></span>
          <div>
            <div className="card-title">دایرکت اینستاگرام</div>
            <div className="card-desc">
              مشتری در دایرکت پیج فروشگاه سؤال می‌پرسد و دستیار با همین کاتالوگ جواب می‌دهد؛ سفارش هم داخل دایرکت ثبت می‌شود.
            </div>
          </div>
        </div>
        <span className={`badge ${account ? 'b-green' : 'b-gray'}`}>
          <span className="dot" />
          {account ? 'وصل است' : 'وصل نیست'}
        </span>
      </div>

      <div className="card-body" style={{ display: 'grid', gap: 18 }}>
        {!status?.configured && (
          <div className="alert alert-warn">
            <IconAlertCircle />
            <span>
              اتصال اینستاگرام هنوز روی سرور پیکربندی نشده است. مدیر سیستم باید
              <span className="mono"> INSTAGRAM_API_KEY </span>
              و برای امنیت
              <span className="mono"> INSTAGRAM_WEBHOOK_SECRET</span>
              را در Environment سرویس API بگذارد. (پیج هر فروشگاه این‌جا نیست؛ از همین صفحه وصل می‌شود.)
            </span>
          </div>
        )}

        {status?.configured && !status.signatureEnforced && (
          <div className="alert alert-warn">
            <IconAlertCircle />
            <span>
              <span className="mono">INSTAGRAM_WEBHOOK_SECRET</span> ست نشده، پس امضای webhook بررسی نمی‌شود.
              هر کسی که آدرس را بداند می‌تواند پیام جعلی بفرستد.
            </span>
          </div>
        )}

        {/* ------------------------------------------------------- حالت ۱: وصل نشده */}
        {!account && (
          <div className="stack" style={{ gap: 14 }}>
            <div className="stack" style={{ gap: 6 }}>
              <div className="kv-k">۱ · پیج فروشگاه را اجازه بدهید</div>
              <p className="small muted" style={{ margin: 0, lineHeight: 1.95 }}>
                روی دکمه‌ی زیر بزنید و با همان حسابی که پیج فروشگاه است وارد شوید. بعد از تأیید،
                برمی‌گردید همین‌جا و پیج را انتخاب می‌کنید.
              </p>
              <div style={{ display: 'grid', gap: 8, marginTop: 4 }}>
                <button
                  className="btn btn-primary"
                  type="button"
                  style={{ width: '100%' }}
                  disabled={!status?.connectable || busy !== null}
                  onClick={() => void openConnectLink()}
                >
                  {busy === 'connect' ? <Spinner size={15} /> : <IconInstagram size={15} />}
                  باز کردن صفحه‌ی اتصال حساب
                </button>
                <button className="btn btn-outline" type="button" style={{ width: '100%' }} disabled={busy !== null} onClick={refreshAccounts}>
                  {busy === 'accounts' ? <Spinner size={15} /> : <IconRefresh size={15} />}
                  پیج را وصل کردم؛ بررسی کن
                </button>
              </div>
              {!status?.connectable && status?.configured && (
                <span className="small" style={{ color: 'var(--amber, #b45309)', lineHeight: 1.9 }}>
                  لینک ورود فروشگاه‌ها روی سرور تنظیم نشده است
                  (<span className="mono">INSTAGRAM_LOGIN_URL</span>).
                </span>
              )}
            </div>

            {accounts && accounts.length > 0 && (
              <div className="stack" style={{ gap: 8 }}>
                <div className="kv-k">۲ · کدام پیج مال این فروشگاه است؟</div>
                <div style={{ display: 'grid', gap: 8 }}>
                  {accounts.map(item => (
                    <div
                      key={item.id}
                      style={{
                        display: 'grid',
                        gap: 10,
                        padding: '12px',
                        border: '1px solid var(--line)',
                        borderRadius: 12,
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flexWrap: 'nowrap' }}>
                        <span
                          aria-hidden="true"
                          style={{
                            width: 32, height: 32, borderRadius: 999, overflow: 'hidden',
                            background: 'var(--surface-2, rgba(0,0,0,.05))',
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            flex: '0 0 auto',
                          }}
                        >
                          {item.profilePhoto
                            // eslint-disable-next-line @next/next/no-img-element
                            ? <img src={item.profilePhoto} alt="" width={32} height={32} style={{ objectFit: 'cover' }} />
                            : <IconInstagram size={16} />}
                        </span>
                        <span style={{ minWidth: 0 }}>
                          <span className="mono" dir="ltr" style={{ display: 'block', fontSize: 13, overflowWrap: 'anywhere' }}>@{item.username || '—'}</span>
                          <span className="small muted">
                            {item.active ? 'فعال' : 'غیرفعال'}
                            {item.expiresAt ? ` · تا ${new Date(item.expiresAt).toLocaleDateString('fa-IR')}` : ''}
                          </span>
                        </span>
                      </span>
                      <button
                        className="btn btn-primary btn-sm"
                        type="button"
                        style={{ width: '100%' }}
                        disabled={busy !== null}
                        onClick={() => void link(item)}
                      >
                        {busy === 'link' ? <Spinner size={14} /> : <IconCheck size={14} />}
                        همین است
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ---------------------------------------------------------- حالت ۲: وصل است */}
        {account && (
          <div className="stack" style={{ gap: 16 }}>
            <div style={{ display: 'grid', gap: 10 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                <span
                  aria-hidden="true"
                  style={{
                    width: 44, height: 44, borderRadius: 999, overflow: 'hidden',
                    background: 'var(--surface-2, rgba(0,0,0,.05))',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    border: '1px solid var(--line)', flex: '0 0 auto',
                  }}
                >
                  {account.profilePhoto
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={account.profilePhoto} alt="" width={44} height={44} style={{ objectFit: 'cover' }} />
                    : <IconInstagram size={20} />}
                </span>
                <span style={{ minWidth: 0 }}>
                  <span className="mono" dir="ltr" style={{ display: 'block', fontSize: 14, overflowWrap: 'anywhere' }}>@{account.username || '—'}</span>
                  <span className="small muted">
                    پیج این فروشگاه
                    {account.linkedAt ? ` · وصل‌شده در ${new Date(account.linkedAt).toLocaleDateString('fa-IR')}` : ''}
                  </span>
                </span>
              </span>
              <button className="btn btn-outline btn-sm" type="button" style={{ width: '100%' }} disabled={busy !== null} onClick={() => void unlink()}>
                {busy === 'unlink' ? <Spinner size={14} /> : null}
                قطع اتصال پیج
              </button>
            </div>

            {expiringSoon && (
              <div className="alert alert-warn">
                <IconAlertCircle />
                <span>
                  دسترسی این پیج {account.daysLeft !== null && account.daysLeft >= 0
                    ? `${account.daysLeft.toLocaleString('fa-IR')} روز دیگر`
                    : 'همین حالا'} منقضی می‌شود. برای اینکه دایرکت‌ها قطع نشوند، یک‌بار دیگر از
                  «صفحه‌ی اتصال حساب» وارد شوید.
                </span>
              </div>
            )}

            <div style={{ height: 1, background: 'var(--line)' }} />

            {/* ------------------------------------------------------ آدرس webhook */}
            <div className="stack" style={{ gap: 8 }}>
              <div className="kv-k">آدرس webhook (در داشبورد BoxAPI ثبت کنید)</div>
              <code
                dir="ltr"
                aria-label="آدرس webhook اینستاگرام"
                style={{
                  display: 'block', padding: '10px 12px', border: '1px solid var(--line)',
                  borderRadius: 10, background: 'var(--surface-2, rgba(0,0,0,.02))',
                  fontSize: 12.5, lineHeight: 1.8, overflowWrap: 'anywhere', wordBreak: 'break-all',
                  textAlign: 'left',
                }}
              >
                {status?.webhookUrl || '—'}
              </code>
              <div style={{ display: 'grid', gap: 8 }}>
                <button className="btn btn-outline btn-sm" type="button" style={{ width: '100%' }} disabled={!status?.webhookUrl}
                  onClick={() => copy(status?.webhookUrl ?? '', 'آدرس webhook کپی شد.')}>
                  <IconCopy size={15} />
                  کپی آدرس
                </button>
                {!status?.webhookUrlIsHttps && (
                  <span className="small" style={{ color: 'var(--amber, #b45309)', lineHeight: 1.9 }}>
                    BoxAPI فقط آدرس <span className="mono">https</span> می‌پذیرد.
                  </span>
                )}
              </div>
            </div>

            <div style={{ height: 1, background: 'var(--line)' }} />

            {/* ------------------------------------------------------------ آزمایش */}
            <div>
              <div className="kv-k">آزمایش اتصال</div>
              <p className="small muted" style={{ margin: '4px 0 10px', lineHeight: 1.9 }}>
                شناسه‌ی گیرنده (IGSID) را از گفتگوهای همین پیج بردارید؛ پیام آزمایشی همان‌جا می‌رسد.
              </p>
              <div style={{ display: 'grid', gap: 8 }}>
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
                  style={{ width: '100%' }}
                  disabled={busy !== null || !/^\d{5,32}$/u.test(recipient.trim())}
                  onClick={() => void sendTest()}
                >
                  {busy === 'test' ? <Spinner size={15} /> : <IconSend size={15} />}
                  ارسال آزمایشی
                </button>
              </div>
              {testNote && (
                <p className="small" style={{ margin: '8px 0 0', lineHeight: 1.9, color: testNote.startsWith('✅') ? 'var(--green, #157347)' : 'var(--amber, #b45309)' }}>
                  {testNote}
                </p>
              )}
            </div>
          </div>
        )}

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
