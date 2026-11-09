'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError, type NotificationItem } from '@/lib/api';
import { useRealtime } from '@/lib/realtime';
import { relativeTime } from '@/lib/format';
import { IconBell, IconBox, IconChat, IconRefresh, IconWallet, IconX } from '@/components/icons';

/**
 * زنگ اعلان‌ها.
 *
 * همه‌ی آیتم‌ها از سرور می‌آیند (`/reports/notifications`) و از سه منبع ساخته
 * می‌شوند: سفارش‌های منتظر پرداخت، پیام‌های بی‌پاسخ مشتری، و موجودی رو به
 * اتمام. هیچ اعلان ساختگی در کار نیست.
 *
 * «خوانده‌شده» در مرورگر نگه داشته می‌شود؛ اما **کلیک روی هر اعلان هم همان
 * لحظه آن را خوانده می‌کند** (قبلاً فقط دکمه‌ی «همه را خوانده‌شده کن» این کار
 * را می‌کرد و کاربر بعد از باز کردن یک اعلان، همچنان شمارنده‌ی خوانده‌نشده
 * می‌دید).
 *
 * هر اعلان به مقصد دقیق خودش می‌رود: پیام مشتری → گفتگوی همان مشتری و اسکرول
 * روی همان پیام، سفارش → همان سفارش، موجودی کم → همان محصول.
 */
const SEEN_KEY = 'forooshyar.seenNotifications';

export function NotificationBell() {
  const router = useRouter();
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

  /**
   * رخداد زنده: پیام تازه، سفارش تازه یا تغییر وضعیت، زنگ را همان لحظه
   * به‌روز می‌کند. بازخوانی دوره‌ای هم می‌ماند (شبکه‌ی ناپایدار، تب خواب‌رفته)
   * ولی فاصله‌اش بیشتر شده چون دیگر مسیر اصلی نیست.
   */
  useRealtime(['chat', 'order', 'stock', 'product'], () => { void load(); });

  // اولین بار در پس‌زمینه، بعد هر ۹۰ ثانیه و هر بار باز شدن پنل.
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 90_000);
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

  function persist(next: string[]) {
    setSeen(next);
    try { window.localStorage.setItem(SEEN_KEY, JSON.stringify(next)); } catch { /* حالت خصوصی مرورگر */ }
  }

  function markAllSeen() {
    persist(items.map(item => item.id));
  }

  /** خواندنِ تک‌اعلان + رفتن به مقصد. */
  function openItem(item: NotificationItem) {
    if (!seen.includes(item.id)) persist([...seen, item.id]);
    setOpen(false);
    router.push(item.href);
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
                <button
                  key={item.id}
                  type="button"
                  className={`notif-item ${isNew ? 'unread' : ''}`}
                  onClick={() => openItem(item)}
                >
                  <span className={`notif-ico tone-${item.tone}`}>{iconFor(item.kind)}</span>
                  <span className="notif-main">
                    <span className="notif-item-title">{item.title}</span>
                    <span className="notif-item-body">{item.body}</span>
                    <span className="notif-item-time">{relativeTime(item.at)}</span>
                  </span>
                  {isNew && <span className="notif-unread-dot" aria-label="خوانده‌نشده" />}
                </button>
              );
            })}
          </div>

          <div className="notif-foot">
            <button type="button" className="notif-link" onClick={markAllSeen} disabled={!unread.length}>
              همه را خوانده‌شده کن
            </button>
            <button type="button" className="notif-link" onClick={() => { setOpen(false); router.push('/app/conversations'); }}>
              همه‌ی گفتگوها
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
