'use client';

import { useEffect, useState } from 'react';
import { api, type ChannelConnection } from '@/lib/api';
import { PageHeader, SkeletonBlock } from '@/components/ui';
import { TelegramConnect } from '@/components/telegram-connect';
import { ChannelConnect } from '@/components/channel-connect';
import { InstagramConnect } from '@/components/instagram-connect';
import { PlatformIcon } from '@/components/platform-icon';
import { IconCheckCircle, IconX } from '@/components/icons';
import { relativeTime } from '@/lib/format';

type Platform = 'INSTAGRAM' | 'TELEGRAM' | 'BALE' | 'RUBIKA';

const PLATFORMS: { id: Platform; name: string; desc: string }[] = [
  { id: 'INSTAGRAM', name: 'اینستاگرام', desc: 'دایرکت و کامنت' },
  { id: 'TELEGRAM', name: 'تلگرام', desc: 'بات فروشگاه' },
  { id: 'BALE', name: 'بله', desc: 'بات پیام‌رسان' },
  { id: 'RUBIKA', name: 'روبیکا', desc: 'بات پیام‌رسان' },
];

function statusChip(status: string): { label: string; cls: string } {
  if (status === 'ACTIVE' || status === 'CONNECTED') return { label: 'متصل', cls: 'b-green' };
  if (status === 'RECONNECT_NEEDED' || status === 'EXPIRED') return { label: 'نیاز به اتصال مجدد', cls: 'b-amber' };
  if (status === 'ERROR') return { label: 'خطا', cls: 'b-red' };
  if (status === 'DISABLED' || status === 'DISCONNECTED') return { label: 'قطع شده', cls: 'b-gray' };
  return { label: status, cls: 'b-gray' };
}

/**
 * اکانت‌ها — روی هر پلتفرم کلیک کنید تا مودال اتصال/پیکربندی باز شود؛
 * بعد از اتصال، کارت حساب در همین صفحه اضافه می‌شود و با کلیک روی کارت،
 * همان مودال در حالت ویرایش باز می‌شود. بله و روبیکا مودال‌های جدا دارند.
 */
export default function AccountsPage() {
  const [channels, setChannels] = useState<ChannelConnection[] | null>(null);
  const [openPlatform, setOpenPlatform] = useState<Platform | null>(null);

  const load = () => api.channels().then(setChannels).catch(() => setChannels([]));
  useEffect(() => { void load(); }, []);

  const connected = (channels ?? []).filter(c => c.status === 'ACTIVE' || c.status === 'CONNECTED');
  const platformName = (id: Platform) => PLATFORMS.find(p => p.id === id)?.name ?? id;

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
              <button
                key={platform.id}
                type="button"
                className="platform-tile"
                onClick={() => setOpenPlatform(platform.id)}
                style={{ textAlign: 'center', cursor: 'pointer', font: 'inherit' }}
                aria-label={`اتصال ${platform.name}`}
              >
                <PlatformIcon platform={platform.id} size={40} />
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
            <div className="card-desc">روی هر کارت بزنید تا تنظیماتش را ببینید و ویرایش کنید.</div>
          </div>
          <div className="card-body" style={{ display: 'grid', gap: 10 }}>
            {connected.map((channel, index) => {
              const chip = statusChip(channel.status);
              return (
                <button
                  key={channel.id}
                  type="button"
                  className="account-card account-card-clickable"
                  style={{ animationDelay: `${index * 0.08}s`, textAlign: 'start', font: 'inherit', cursor: 'pointer', width: '100%' }}
                  onClick={() => setOpenPlatform(channel.platform)}
                  aria-label={`ویرایش حساب ${channel.displayName || platformName(channel.platform)}`}
                >
                  <PlatformIcon platform={channel.platform} size={40} />
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <strong style={{ display: 'block' }}>{channel.displayName || platformName(channel.platform)}</strong>
                    <span className="small muted">
                      {platformName(channel.platform)}
                      {channel.username ? ` · @${channel.username}` : ''}
                      {channel.lastSeenAt ? ` · آخرین فعالیت ${relativeTime(channel.lastSeenAt)}` : ''}
                    </span>
                  </span>
                  <span className={`badge ${chip.cls}`}><span className="dot" />{chip.label}</span>
                </button>
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
        <div className="modal-backdrop" onClick={() => setOpenPlatform(null)} role="dialog" aria-modal="true" aria-label={`اتصال ${platformName(openPlatform)}`}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <div className="modal-head">
              <div className="row" style={{ gap: 10, alignItems: 'center' }}>
                <PlatformIcon platform={openPlatform} size={32} />
                <div className="card-title">اتصال {platformName(openPlatform)}</div>
              </div>
              <button type="button" className="btn btn-ghost btn-icon" onClick={() => setOpenPlatform(null)} aria-label="بستن"><IconX size={16} /></button>
            </div>
            <div className="modal-body">
              {openPlatform === 'INSTAGRAM' && <InstagramConnect onChanged={load} />}
              {openPlatform === 'TELEGRAM' && <TelegramConnect onChanged={load} />}
              {openPlatform === 'BALE' && <ChannelConnect platform="BALE" onChanged={load} />}
              {openPlatform === 'RUBIKA' && <ChannelConnect platform="RUBIKA" onChanged={load} />}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
