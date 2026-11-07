'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, type TelegramOwnerCode, type TelegramStatus } from '@/lib/api';
import { SkeletonBlock, Spinner, useToast } from '@/components/ui';
import { IconAlertCircle, IconCheckCircle, IconCopy, IconSend } from '@/components/icons';

/**
 * اتصال تلگرام. سه وضعیت دارد و برای هر کدام یک کار مشخص:
 *   ۱. وصل نیست           → «فعال‌سازی» (لینک مشتری ساخته می‌شود)
 *   ۲. مشتری وصل است      → لینک را کپی کن و به مشتری‌ها بده
 *   ۳. فروشنده وصل نیست   → کد یک‌بارمصرف بگیر و در چت بات بفرست تا اعلان‌ها برسد
 */
export function TelegramConnect() {
  const toast = useToast();
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [owner, setOwner] = useState<TelegramOwnerCode | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'connect' | 'owner' | 'disconnect' | 'disable' | 'webhook' | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    api.telegramStatus()
      .then(data => { if (alive) setStatus(data); })
      .catch(() => { if (alive) setError('وضعیت اتصال تلگرام دریافت نشد.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const run = useCallback(async (
    kind: 'connect' | 'owner' | 'disconnect' | 'disable' | 'webhook',
    action: () => Promise<TelegramStatus | TelegramOwnerCode>,
    success: { title: string; body: string },
  ) => {
    setBusy(kind);
    setError('');
    try {
      const result = await action();
      if ('ownerCode' in result) setOwner(result);
      else { setStatus(result); if (kind !== 'owner') setOwner(null); }
      toast.success(success.title, success.body);
    } catch (problem) {
      const message = problem instanceof ApiError ? problem.message : 'درخواست انجام نشد.';
      setError(message);
      toast.error('اتصال انجام نشد', message);
    } finally {
      setBusy(null);
    }
  }, [toast]);

  /** ثبت webhook از سمت سرور؛ بعدش وضعیت را دوباره می‌خوانیم. */
  async function registerWebhook() {
    setBusy('webhook');
    setError('');
    try {
      await api.telegramRegisterWebhook();
      setStatus(await api.telegramStatus());
      toast.success('webhook ثبت شد', 'از این پس پیام‌های تلگرام به این سرور می‌رسند.');
    } catch (problem) {
      const message = problem instanceof ApiError ? problem.message : 'ثبت webhook انجام نشد.';
      setError(message);
      toast.error('ثبت webhook انجام نشد', message);
    } finally {
      setBusy(null);
    }
  }

  async function copy(value: string, what: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success('کپی شد', what);
    } catch {
      // clipboard در iframe یا بدون HTTPS کار نمی‌کند؛ متن را انتخاب‌شدنی می‌گذاریم
      toast.error('کپی نشد', 'متن را دستی انتخاب کنید.');
    }
  }

  if (loading) return <SkeletonBlock height={220} />;

  const connected = Boolean(status?.active && status.customerLink);
  const ownerLinked = Boolean(status?.ownerLinked);

  return (
    <section className="card">
      <div className="card-head">
        <div className="row" style={{ gap: 10 }}>
          <span className="stat-ico"><IconSend size={15} /></span>
          <div>
            <div className="card-title">اتصال به تلگرام</div>
            <div className="card-desc">
              مشتری‌ها در تلگرام سؤال می‌پرسند و دستیار با همین موجودی و تنظیمات جواب می‌دهد.
            </div>
          </div>
        </div>
        <span className={`badge ${connected ? 'b-green' : 'b-gray'}`}>
          <span className="dot" />
          {connected ? 'فعال' : 'غیرفعال'}
        </span>
      </div>

      <div className="card-body" style={{ display: 'grid', gap: 16 }}>
        {!status?.botConfigured && (
          <div className="alert alert-warn">
            <IconAlertCircle />
            <span>
              بات تلگرام هنوز روی سرور پیکربندی نشده است. مدیر سیستم باید
              <span className="mono"> TELEGRAM_BOT_TOKEN </span>
              و
              <span className="mono"> TELEGRAM_WEBHOOK_SECRET </span>
              را در Environment سرویس API بگذارد و سرویس را ری‌استارت کند.
            </span>
          </div>
        )}

        {/* --------------------------------------------------- وضعیت webhook */}
        {status?.botConfigured && (
          status.webhook?.registered && status.webhook.pointsHere && !status.webhook.lastError && status.webhook.buttonsWork !== false ? (
            <div className="row" style={{ gap: 8, alignItems: 'center' }}>
              <span className="badge b-green"><span className="dot" />webhook ثبت شده</span>
              <span className="small muted">
                پیام‌های تلگرام به همین سرور می‌رسند
                {status.webhook.pending > 0 ? ` · ${status.webhook.pending} پیام در صف` : ''}
              </span>
            </div>
          ) : (
            <div className="alert alert-warn">
              <IconAlertCircle />
              <span>
                {status.webhook?.registered === false
                  ? 'webhook هنوز ثبت نشده، پس هیچ پیامی به سرور نمی‌رسد.'
                  : status.webhook?.pointsHere === false
                    ? 'webhook به آدرس دیگری اشاره می‌کند (آدرس سرویس عوض شده؟).'
                    : status.webhook?.buttonsWork === false
                      ? 'webhook بدون callback_query ثبت شده، پس دکمه‌های انتخاب محصول و سفارش کار نمی‌کنند. یک‌بار دوباره ثبت کنید.'
                      : `تلگرام از این سرور خطا می‌گیرد: ${status.webhook?.lastError || status.webhook?.error || 'نامشخص'}`}
                {' '}
                <button
                  className="btn btn-outline btn-sm"
                  type="button"
                  style={{ marginInlineStart: 8 }}
                  disabled={busy !== null}
                  onClick={registerWebhook}
                >
                  {busy === 'webhook' ? <Spinner size={13} /> : null}
                  ثبت webhook از سرور
                </button>
              </span>
            </div>
          )
        )}

        {/* ---------------------------------------------------------- مرحله ۱ */}
        {!connected ? (
          <div className="stack" style={{ gap: 12 }}>
            <p className="small muted" style={{ lineHeight: 1.95, margin: 0 }}>
              با فعال‌سازی، یک لینک اختصاصی برای فروشگاه شما ساخته می‌شود. مشتری با باز کردن آن
              وارد چت بات می‌شود و سؤالش را می‌پرسد؛ شما لازم نیست هیچ کاری بکنید.
            </p>
            <div>
              <button
                className="btn btn-primary"
                onClick={() => run('connect', () => api.telegramConnect(), {
                  title: 'تلگرام فعال شد',
                  body: 'لینک فروشگاه ساخته شد؛ همان را به مشتری‌ها بدهید.',
                })}
                disabled={busy !== null || !status?.botConfigured}
              >
                {busy === 'connect' ? <Spinner size={15} /> : <IconCheckCircle size={16} />}
                فعال‌سازی اتصال تلگرام
              </button>
            </div>
          </div>
        ) : (
          <div className="stack" style={{ gap: 16 }}>
            {/* ------------------------------------------------------ لینک مشتری */}
            <div>
              <div className="kv-k" style={{ marginBottom: 8 }}>لینک فروشگاه برای مشتری‌ها</div>
              <div className="row" style={{ gap: 8, alignItems: 'stretch' }}>
                <input
                  className="input mono"
                  readOnly
                  dir="ltr"
                  value={status?.customerLink ?? ''}
                  onFocus={event => event.currentTarget.select()}
                  aria-label="لینک فروشگاه در تلگرام"
                />
                <button
                  className="btn btn-outline"
                  onClick={() => copy(status?.customerLink ?? '', 'لینک تلگرام فروشگاه کپی شد.')}
                  type="button"
                >
                  <IconCopy size={16} />
                  کپی
                </button>
              </div>
              <p className="small muted mt-2" style={{ margin: 0, lineHeight: 1.9 }}>
                این لینک را در بیو اینستاگرام، پست‌ها یا پیام‌هایتان بگذارید. هر مشتری که آن را باز کند
                به همین فروشگاه وصل می‌شود.
              </p>
            </div>

            <div style={{ height: 1, background: 'var(--line)' }} />

            {/* -------------------------------------------------- اعلان به فروشنده */}
            <div>
              <div className="row-between" style={{ marginBottom: 8 }}>
                <div className="kv-k">اعلان فروش و موجودی کم</div>
                <span className={`badge ${ownerLinked ? 'b-green' : 'b-amber'}`}>
                  <span className="dot" />
                  {ownerLinked ? 'وصل است' : 'وصل نیست'}
                </span>
              </div>

              {ownerLinked ? (
                <div className="stack" style={{ gap: 10 }}>
                  <p className="small muted" style={{ margin: 0, lineHeight: 1.9 }}>
                    از این پس هر فروش و هر محصولی که موجودی‌اش کم شود، در چت تلگرام شما اعلان می‌گیرد.
                  </p>
                  <div className="row" style={{ gap: 8 }}>
                    <button
                      className="btn btn-outline"
                      type="button"
                      disabled={busy !== null}
                      onClick={() => run('disconnect', () => api.telegramDisconnectOwner(), {
                        title: 'قطع شد',
                        body: 'دیگر اعلانی به تلگرام شما نمی‌رسد.',
                      })}
                    >
                      {busy === 'disconnect' ? <Spinner size={15} /> : null}
                      قطع اعلان
                    </button>
                  </div>
                </div>
              ) : (
                <div className="stack" style={{ gap: 10 }}>
                  <p className="small muted" style={{ margin: 0, lineHeight: 1.9 }}>
                    برای گرفتن اعلان‌ها، یک کد یک‌بارمصرف بگیرید و آن را در چت بات
                    {status?.botUsername ? ` (@${status.botUsername})` : ''} بفرستید.
                  </p>
                  {!owner ? (
                    <div>
                      <button
                        className="btn btn-outline"
                        type="button"
                        disabled={busy !== null}
                        onClick={() => run('owner', () => api.telegramOwnerCode(), {
                          title: 'کد ساخته شد',
                          body: 'کد را در چت بات بفرستید (تا چند دقیقه معتبر است).',
                        })}
                      >
                        {busy === 'owner' ? <Spinner size={15} /> : <IconSend size={15} />}
                        ساخت کد اتصال
                      </button>
                    </div>
                  ) : (
                    <div className="stack" style={{ gap: 8 }}>
                      <div className="row" style={{ gap: 8, alignItems: 'stretch' }}>
                        <code className="input mono" dir="ltr" style={{ display: 'flex', alignItems: 'center' }}>
                          {owner.command ?? owner.ownerCode}
                        </code>
                        <button
                          className="btn btn-outline"
                          type="button"
                          onClick={() => copy(owner.command ?? `/link ${owner.ownerCode}`, 'دستور کپی شد؛ در چت بات بفرستید.')}
                        >
                          <IconCopy size={16} />
                          کپی
                        </button>
                        {owner.ownerLink && (
                          <a className="btn btn-primary" href={owner.ownerLink} target="_blank" rel="noreferrer">
                            باز کردن بات
                          </a>
                        )}
                      </div>
                      <p className="small muted" style={{ margin: 0 }}>
                        کد یک‌بار مصرف است؛ بعد از اتصال، خودش پاک می‌شود.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div style={{ height: 1, background: 'var(--line)' }} />

            <div className="row-between">
              <span className="small muted num">
                {status?.conversations ?? 0} گفتگوی مشتری
              </span>
              <button
                className="btn btn-ghost"
                type="button"
                disabled={busy !== null}
                onClick={() => run('disable', () => api.telegramDisable(), {
                  title: 'غیرفعال شد',
                  body: 'لینک فروشگاه دیگر کار نمی‌کند؛ داده‌ها باقی می‌مانند.',
                })}
              >
                {busy === 'disable' ? <Spinner size={15} /> : null}
                غیرفعال کردن اتصال
              </button>
            </div>
          </div>
        )}

        {error && <div className="alert alert-error"><IconAlertCircle /><span>{error}</span></div>}
      </div>
    </section>
  );
}
