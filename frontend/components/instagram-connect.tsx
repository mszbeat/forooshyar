'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError, type InstagramAccount, type InstagramStatus } from '@/lib/api';
import { SkeletonBlock, Spinner, useToast } from '@/components/ui';
import {
  IconAlertCircle, IconCheck, IconCheckCircle, IconCopy, IconInstagram, IconRefresh, IconSend,
} from '@/components/icons';

/** پیامی که تا رسیدن لینک، داخل پنجره‌ی انتظار دیده می‌شود (انگلیسیِ بی‌ربط نباشد). */
const WAITING_PAGE = `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8">
<title>اتصال پیج اینستاگرام</title></head>
<body style="margin:0;display:grid;place-items:center;min-height:100vh;background:#f7f7fb;color:#2b2b3c;font:400 15px/1.9 Vazirmatn,Tahoma,system-ui,sans-serif">
<div style="text-align:center;max-width:340px;padding:24px">
<div style="width:38px;height:38px;margin:0 auto 16px;border:3px solid #ddd7f7;border-top-color:#6d4aff;border-radius:50%;animation:spin 900ms linear infinite"></div>
<p style="margin:0 0 6px;font-weight:600">در حال باز کردن صفحه‌ی ورود اینستاگرام</p>
<p style="margin:0;color:#6b6b80;font-size:13px">اگر بیشتر از چند ثانیه طول کشید، این پنجره را ببندید و دوباره از پنل امتحان کنید.</p>
</div><style>@keyframes spin{to{transform:rotate(360deg)}}</style></body></html>`;

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
  /** پنجره‌ی اتصال باز است و هنوز برنگشته‌ایم. */
  const pendingConnect = useRef(false);
  /**
   * گفتگوهای اینستاگرامِ همین فروشگاه.
   *
   * چرا لازم است: کاربر برای «ارسال آزمایشی» باید شناسه‌ی گیرنده (IGSID) را
   * بداند. عددی که در آدرس `instagram.com/direct/t/…` می‌بیند شناسه‌ی
   * «رشته» است و همیشه همان IGSID نیست؛ تنها مرجع مطمئن، `sender.id` وب‌هوک
   * است که همان `chatId` گفتگوها (`ig:<IGSID>`) را می‌سازد. پس به‌جای اینکه
   * کاربر حدس بزند، همان مقدارِ ثبت‌شده را با یک کلیک می‌فرستیم.
   */
  const [recent, setRecent] = useState<{ chatId: string; name: string; igsid: string }[]>([]);

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

  const loadRecent = useCallback(async () => {
    try {
      const list = await api.conversations();
      setRecent(
        list.items
          .filter(item => item.chatId.startsWith('ig:'))
          .map(item => ({
            chatId: item.chatId,
            name: item.name || item.username || 'مشتری',
            igsid: item.chatId.slice(3),
          })),
      );
    } catch {
      setRecent([]);
    }
  }, []);

  useEffect(() => {
    if (status?.accountLinked) void loadRecent();
  }, [status?.accountLinked, loadRecent]);

  /**
   * باز کردن صفحه‌ی اتصال حساب.
   *
   * دو نکته که هر دو در عمل به «صفحه‌ی سفید» می‌رسیدند:
   * ۱. `noopener` در پارامترهای window.open باعث می‌شود مرورگر پنجره را با
   *    opener تهی بسازد و مقدار بازگشتی `null` باشد؛ آن‌وقت کد نمی‌تواند در همان
   *    پنجره آدرس بگذارد و پنجره‌ی خالیِ about:blank باز می‌ماند. پس پنجره را
   *    کنترل‌شده باز می‌کنیم و بعد خودمان `opener` را تهی می‌کنیم.
   * ۲. بین کلیک و رسیدن لینک از سرور فاصله است؛ اگر پنجره سفید بمانَد کاربر
   *    فکر می‌کند خراب است، پس داخلش یک پیام انتظار می‌نویسیم.
   *
   * مرورگر باید پنجره را در همان لحظه‌ی کلیک باز کند (پاپ‌آپ‌بلاکر)، برای همین
   * اول پنجره و بعد درخواست به سرور.
   */
  async function openConnectLink() {
    const popup = window.open('about:blank', '_blank', 'popup=yes,width=560,height=760');
    if (popup) {
      try {
        popup.opener = null;
        popup.document.write(WAITING_PAGE);
        popup.document.close();
      } catch {
        /* دسترسی به پنجره ممکن نشد؛ پایین‌تر با پنجره‌ی تازه امتحان می‌کنیم. */
      }
    }
    setBusy('connect');
    setError('');
    try {
      const result = await api.instagramConnectUrl();
      if (!result.ok || !result.url) {
        popup?.close();
        setError(result.error ?? 'لینک ورود در دسترس نیست.');
        return;
      }
      pendingConnect.current = true;
      if (popup && !popup.closed) {
        popup.location.replace(result.url);
      } else if (!window.open(result.url, '_blank')) {
        setError('مرورگر پنجره‌ی جدید را بست. اجازه‌ی باز شدن پنجره را برای این سایت فعال کنید.');
        pendingConnect.current = false;
      }
    } catch (problem) {
      popup?.close();
      pendingConnect.current = false;
      setError(problem instanceof ApiError ? problem.message : 'لینک ورود در دسترس نیست.');
    } finally {
      setBusy(null);
    }
  }

  /** فهرست پیج‌ها را از BoxAPI می‌گیرد؛ نتیجه‌اش ربطی به «وصل‌شدن» ندارد. */
  const refreshAccounts = useCallback(async () => {
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
  }, [toast]);

  // وقتی فروشنده از تب اینستاگرام برمی‌گردد، فهرست پیج‌ها را خودمان می‌خوانیم؛
  // لازم نیست یادش بیفتد دکمه‌ی «بررسی کن» را بزند.
  useEffect(() => {
    function onReturn() {
      if (!pendingConnect.current) return;
      pendingConnect.current = false;
      void refreshAccounts();
    }
    window.addEventListener('focus', onReturn);
    return () => window.removeEventListener('focus', onReturn);
  }, [refreshAccounts]);

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

  async function sendTest(target?: string) {
    const to = (target ?? recipient).trim();
    if (target) setRecipient(target);
    setBusy('test');
    setTestNote('');
    try {
      const result = await api.instagramTest(to);
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
                اگر مشتری‌ای به پیج دایرکت داده، از فهرست بالا بفرستید. عددِ آدرس
                <span className="mono" dir="ltr"> direct/t/… </span>
                شناسه‌ی «رشته» است و همیشه با شناسه‌ی گیرنده یکی نیست؛ شناسه‌ی درست
                همان است که فهرست بالا نشان می‌دهد.
              </p>
              {recent.length > 0 && (
                <div style={{ display: 'grid', gap: 6, marginBottom: 10 }}>
                  <span className="small muted">یک‌کلیکی به گفتگوهای همین پیج:</span>
                  {recent.slice(0, 4).map(item => (
                    <button
                      key={item.chatId}
                      className="btn btn-outline btn-sm"
                      type="button"
                      style={{ justifyContent: 'space-between', gap: 10 }}
                      disabled={busy !== null}
                      onClick={() => void sendTest(item.igsid)}
                    >
                      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        آزمایش به {item.name}
                      </span>
                      <span className="mono small muted" dir="ltr" style={{ flex: '0 0 auto' }}>
                        …{item.igsid.slice(-6)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
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
