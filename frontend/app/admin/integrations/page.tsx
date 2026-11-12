'use client';

import { useEffect, useState } from 'react';
import { api, type InstagramStatus } from '@/lib/api';
import { IconCopy, IconRefresh } from '@/components/icons';
import { useToast } from '@/components/ui';

/**
 * یکپارچه‌سازی‌ها (فقط ادمین) — جزئیات فنی اتصال اینستاگرام که فروشنده
 * هرگز نمی‌بیند: آدرس webhook، وضعیت امضا، آخرین رویداد و لاگ خام.
 */
export default function AdminIntegrationsPage() {
  const toast = useToast();
  const [status, setStatus] = useState<InstagramStatus | null>(null);
  const [events, setEvents] = useState<{ eventType: string; at: string; summary: string }[]>([]);

  const load = async () => {
    try { setStatus(await api.instagramStatus()); } catch { /* ignore */ }
    try {
      const board = await api.instagramEvents();
      setEvents(board.items ?? []);
    } catch { setEvents([]); }
  };

  useEffect(() => { void load(); }, []);

  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); toast.success('کپی شد', 'آدرس در حافظه کپی شد.'); }
    catch { toast.error('کپی نشد', 'دسترسی به حافظه ندارید.'); }
  };

  return (
    <div className="stack">
      <div className="card">
        <div className="card-head">
          <div>
            <div className="card-title">اینستاگرام — وضعیت فنی</div>
            <div className="card-desc">آدرس webhook، امضا و آخرین رویدادها. این صفحه فقط برای مدیر سامانه است.</div>
          </div>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => void load()}><IconRefresh size={14} /> به‌روزرسانی</button>
        </div>
        <div className="card-body" style={{ display: 'grid', gap: 12 }}>
          <div className="kv-row"><span>پیکربندی‌شده</span><strong>{status ? (status.configured ? 'بله' : 'خیر') : '…'}</strong></div>
          <div className="kv-row"><span>بررسی امضا فعال است</span><strong>{status ? (status.signatureEnforced ? 'بله' : 'خیر') : '…'}</strong></div>
          <div className="kv-row"><span>پیام‌ها</span><strong>{status?.stats.messages ?? '…'}</strong></div>
          <div className="kv-row"><span>گفتگوها</span><strong>{status?.stats.conversations ?? '…'}</strong></div>
          <div className="kv-row"><span>آخرین رویداد</span><strong>{status?.stats.lastEventAt ? new Date(status.stats.lastEventAt).toLocaleString('fa-IR') : '—'}</strong></div>
          <div>
            <div className="kv-k">آدرس webhook</div>
            <code dir="ltr" style={{ display: 'block', padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 10, fontSize: 12.5, overflowWrap: 'anywhere', wordBreak: 'break-all', textAlign: 'left' }}>
              {status?.webhookUrl || '—'}
            </code>
            <button type="button" className="btn btn-outline btn-sm" style={{ marginTop: 8 }} disabled={!status?.webhookUrl} onClick={() => void copy(status?.webhookUrl ?? '')}>
              <IconCopy size={14} /> کپی آدرس
            </button>
            {status && !status.webhookUrlIsHttps && <p className="small" style={{ color: 'var(--amber, #b45309)' }}>آدرس https نیست؛ ارائه‌دهنده فقط https می‌پذیرد.</p>}
          </div>
          <div>
            <div className="kv-k">لاگ خام رویدادها</div>
            {events.length === 0 && <p className="small muted">هنوز رویدادی ثبت نشده است.</p>}
            {events.slice(0, 20).map((item, index) => (
              <div key={`${item.at}-${index}`} className="kv-row">
                <span className="mono" dir="ltr">{item.eventType}</span>
                <span>{item.summary} · {new Date(item.at).toLocaleString('fa-IR')}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
