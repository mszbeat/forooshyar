'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api, ApiError, type NotificationItem } from '@/lib/api';
import { relativeTime } from '@/lib/format';
import { IconBell, IconBox, IconChat, IconRefresh, IconWallet, IconX } from '@/components/icons';

/**
 * زنگ اعلان‌ها.
 *
 * همه‌ی آیتم‌ها از سرور می‌آیند (`/reports/notifications`) و از سه منبع ساخته
 * می‌شوند: سفارش‌های منتظر پرداخت، پیام‌های بی‌پاسخ مشتری، و موجودی رو به
 * اتمام. هیچ اعلان ساختگی در کار نیست.
 *
 * «خوانده‌شده» فقط در مرورگر نگه داشته می‌شود (شناسه‌ی آخرین اعلان‌های دیده‌شده)؛
 * چرا: اعلان‌ها وضعیت واقعی سیستم‌اند و «خواندن» یک ترجیح کاربر است، پس لازم
 * نیست سطر دیتابیس برایش ساخته شود.
 */
const SEEN_KEY = 'forooshyar.seenNotifications';

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [seen, setSeen] = useState<string[]>([]);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SEEN_KEY);
      if (raw) setSeen(JSON.parse(raw) as string[]);
    } catch {
      setSeen([]);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.notifications();
      setItems(data.items);
      setError('');
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.message : 'دریافت اعلان‌ها انجام نشد.');
    } finally {
      setLoading(false);
    }
  }, []);

  // اولین بار در پس‌زمینه، بعد هر ۶۰ ثانیه و هر بار باز شدن پنل.
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const unread = items.filter(item => !seen.includes(item.id));

  function markAllSeen() {
    const ids = items.map(item => item.id);
    setSeen(ids);
    try { window.localStorage.setItem(SEEN_KEY, JSON.stringify(ids)); } catch { /* حالت خصوصی مرورگر */ }
  }

  const iconFor = (kind: NotificationItem['kind']) =>
    kind === 'order' ? <IconWallet size={16} /> : kind === 'message' ? <IconChat size={16} /> : <IconBox size={16} />;

  return (
    <div className="notif" ref={wrap}>
      <button
        type="button"
        className={`btn btn-outline btn-icon notif-btn ${open ? 'on' : ''}`}
        aria-label={unread.length ? `اعلان‌ها، ${unread.length} مورد خوانده‌نشده` : 'اعلان‌ها'}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => { setOpen(previous => !previous); if (!open) void load(); }}
      >
        <IconBell size={17} />
        {unread.length > 0 && <span className="notif-dot" aria-hidden="true">{unread.length.toLocaleString('fa-IR')}</span>}
      </button>

      {open && (
        <div className="notif-panel" role="dialog" aria-label="اعلان‌ها">
          <div className="notif-head">
            <div>
              <div className="notif-title">اعلان‌ها</div>
              <div className="notif-sub">
                {loading ? 'در حال به‌روزرسانی…' : unread.length ? `${unread.length.toLocaleString('fa-IR')} مورد تازه` : 'همه‌چیز خوانده شده'}
              </div>
            </div>
            <div className="notif-tools">
              <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => void load()} aria-label="به‌روزرسانی" title="به‌روزرسانی">
                <IconRefresh size={15} />
              </button>
              <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => setOpen(false)} aria-label="بستن" title="بستن">
                <IconX size={15} />
              </button>
            </div>
          </div>

          <div className="notif-body">
            {error && <div className="notif-empty">{error}</div>}

            {!error && !loading && items.length === 0 && (
              <div className="notif-empty">
                <span className="notif-empty-ico"><IconBell size={20} /></span>
                اعلانی نیست. سفارش تازه، پیام بی‌پاسخ و موجودی کم همین‌جا نشان داده می‌شود.
              </div>
            )}

            {items.map(item => {
              const isNew = !seen.includes(item.id);
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  className={`notif-item ${isNew ? 'unread' : ''}`}
                  onClick={() => setOpen(false)}
                >
                  <span className={`notif-ico tone-${item.tone}`}>{iconFor(item.kind)}</span>
                  <span className="notif-main">
                    <span className="notif-item-title">{item.title}</span>
                    <span className="notif-item-body">{item.body}</span>
                    <span className="notif-item-time">{relativeTime(item.at)}</span>
                  </span>
                  {isNew && <span className="notif-unread-dot" aria-label="خوانده‌نشده" />}
                </Link>
              );
            })}
          </div>

          <div className="notif-foot">
            <button type="button" className="notif-link" onClick={markAllSeen} disabled={!unread.length}>
              همه را خوانده‌شده کن
            </button>
            <Link href="/app/orders" className="notif-link" onClick={() => setOpen(false)}>
              همه‌ی سفارش‌ها
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
