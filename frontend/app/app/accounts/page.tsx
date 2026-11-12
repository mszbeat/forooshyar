'use client';

import { useEffect, useState } from 'react';
import { api, type ChannelConnection } from '@/lib/api';
import { PageHeader, SkeletonBlock } from '@/components/ui';
import { TelegramConnect } from '@/components/telegram-connect';
import { ChannelConnect } from '@/components/channel-connect';
import { InstagramConnect } from '@/components/instagram-connect';
import { IconBolt, IconCheckCircle, IconInstagram, IconSend, IconX } from '@/components/icons';
import { relativeTime } from '@/lib/format';

type Platform = 'INSTAGRAM' | 'TELEGRAM' | 'BALE' | 'RUBIKA';

const PLATFORMS: { id: Platform; name: string; desc: string; icon: typeof IconInstagram; anchor: string }[] = [
  { id: 'INSTAGRAM', name: 'اینستاگرام', desc: 'دایرکت و کامنت', icon: IconInstagram, anchor: 'instagram' },
  { id: 'TELEGRAM', name: 'تلگرام', desc: 'بات فروشگاه', icon: IconSend, anchor: 'telegram' },
  { id: 'BALE', name: 'بله', desc: 'بات پیام‌رسان', icon: IconBolt, anchor: 'messengers' },
  { id: 'RUBIKA', name: 'روبیکا', desc: 'بات پیام‌رسان', icon: IconBolt, anchor: 'messengers' },
];

function statusChip(status: string): { label: string; cls: string } {
  if (status === 'ACTIVE' || status === 'CONNECTED') return { label: 'متصل', cls: 'b-green' };
  if (status === 'RECONNECT_NEEDED' || status === 'EXPIRED') return { label: 'نیاز به اتصال مجدد', cls: 'b-amber' };
  if (status === 'ERROR') return { label: 'خطا', cls: 'b-red' };
  if (status === 'DISABLED') return { label: 'غیرفعال', cls: 'b-gray' };
  return { label: status, cls: 'b-gray' };
}

/**
 * اکانت‌ها — فروشنده فقط روی پلتفرم کلیک می‌کند، اجازه می‌دهد و کارت
 * وصل‌شده را می‌بیند. هیچ جزئیات فنی (webhook، توکن، ارائه‌دهنده) این‌جا
 * نیست؛ آن‌ها در صفحه‌ی ادمین «یکپارچه‌سازی‌ها» هستند.
 */
export default function AccountsPage() {
  const [channels, setChannels] = useState<ChannelConnection[] | null>(null);
  const [openPlatform, setOpenPlatform] = useState<Platform | null>(null);
  const [manage, setManage] = useState<ChannelConnection | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  const load = () => api.channels().then(setChannels).catch(() => setChannels([]));
  useEffect(() => { void load(); }, []);

  const connected = (channels ?? []).filter(c => c.status === 'ACTIVE' || c.status === 'CONNECTED');

  return (
    <div className="stack">
      <PageHeader
        eyebrow="اتصال"
        title="اکانت‌ها"
        description="یکی از پلتفرم‌ها را انتخاب کنید و وصل کنید؛ مشتری از همان‌جا سؤال می‌پرسد و سفارش می‌دهد."
      />

      <section className="card">
        <div className="card-body">
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
            {PLATFORMS.map(platform => (
              <button key={platform.id} type="button" className="platform-tile" onClick={() => setOpenPlatform(platform.id)} style={{ textAlign: 'center', cursor: 'pointer', font: 'inherit' }}>
                <platform.icon size={22} />
                <strong>{platform.name}</strong>
                <span>{platform.desc}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {channels === null && <SkeletonBlock height={120} />}

      {channels !== null && connected.length > 0 && (
        <section className="card">
          <div className="card-head">
            <div className="card-title">حساب‌های متصل</div>
          </div>
          <div className="card-body" style={{ display: 'grid', gap: 10 }}>
            {connected.map((channel, index) => {
              const chip = statusChip(channel.status);
              const platformName = PLATFORMS.find(p => p.id === channel.platform)?.name ?? channel.platform;
              return (
                <div key={channel.id} className="account-card" style={{ animationDelay: `${index * 0.08}s` }}>
                  <span className="avatar avatar-brand">{channel.displayName?.trim().charAt(0) ?? '؟'}</span>
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <strong style={{ display: 'block' }}>{channel.displayName || platformName}</strong>
                    <span className="small muted">
                      {platformName}
                      {channel.username ? ` · @${channel.username}` : ''}
                      {channel.lastSeenAt ? ` · آخرین فعالیت ${relativeTime(channel.lastSeenAt)}` : ''}
                    </span>
                  </span>
                  <span className={`badge ${chip.cls}`}><span className="dot" />{chip.label}</span>
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => { setManage(channel); setConfirmDisconnect(false); }}>مدیریت</button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {channels !== null && connected.length === 0 && (
        <section className="card">
          <div className="card-body" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span className="stat-ico"><IconCheckCircle size={15} /></span>
            <p className="small muted" style={{ margin: 0 }}>هنوز هیچ حسابی وصل نشده است. روی یک پلتفرم بزنید تا شروع کنید.</p>
          </div>
        </section>
      )}

      {openPlatform && (
        <div className="modal-backdrop" onClick={() => setOpenPlatform(null)} role="dialog" aria-modal="true" aria-label="اتصال پلتفرم">
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <div className="modal-head">
              <div className="card-title">اتصال {PLATFORMS.find(p => p.id === openPlatform)?.name}</div>
              <button type="button" className="btn btn-ghost btn-icon" onClick={() => setOpenPlatform(null)} aria-label="بستن"><IconX size={16} /></button>
            </div>
            <div className="modal-body">
              {openPlatform === 'INSTAGRAM' && <InstagramConnect />}
              {openPlatform === 'TELEGRAM' && <TelegramConnect />}
              {(openPlatform === 'BALE' || openPlatform === 'RUBIKA') && <ChannelConnect />}
            </div>
          </div>
        </div>
      )}

      {manage && (
        <div className="modal-backdrop" onClick={() => setManage(null)} role="dialog" aria-modal="true" aria-label="مدیریت حساب">
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div className="modal-head">
              <div className="card-title">مدیریت {manage.displayName}</div>
              <button type="button" className="btn btn-ghost btn-icon" onClick={() => setManage(null)} aria-label="بستن"><IconX size={16} /></button>
            </div>
            <div className="modal-body" style={{ display: 'grid', gap: 10 }}>
              <div className="kv-row"><span>وضعیت</span><strong>{statusChip(manage.status).label}</strong></div>
              <div className="kv-row"><span>آخرین فعالیت</span><strong>{manage.lastSeenAt ? relativeTime(manage.lastSeenAt) : '—'}</strong></div>
              {manage.lastError && <div className="alert alert-error"><span>{manage.lastError}</span></div>}
              <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => { setOpenPlatform(manage.platform); setManage(null); }}>اتصال مجدد</button>
                <button type="button" className="btn btn-outline btn-sm" onClick={async () => {
                  try { await api.disconnectChannel(manage.id); toastOk(); setManage(null); void load(); }
                  catch { /* ignore */ }
                }}>غیرفعال‌کردن</button>
                {!confirmDisconnect ? (
                  <button type="button" className="btn btn-outline btn-sm" style={{ color: 'var(--danger)' }} onClick={() => setConfirmDisconnect(true)}>قطع اتصال</button>
                ) : (
                  <>
                    <span className="small">مطمئن هستید؟ مشتری دیگر از این حساب به فروشگاه نمی‌رسد.</span>
                    <button type="button" className="btn btn-primary btn-sm" onClick={async () => {
                      try { await api.deleteChannel(manage.id); setManage(null); void load(); }
                      catch { /* ignore */ }
                    }}>بله، قطع کن</button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function toastOk() { /* feedback via reload */ }
