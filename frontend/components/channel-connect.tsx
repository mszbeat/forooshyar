'use client';

import { useEffect, useState } from 'react';
import { api, ApiError, type ChannelConnection } from '@/lib/api';
import { Field, SkeletonBlock, Spinner, useToast } from '@/components/ui';
import { IconAlertCircle, IconCopy, IconPlus } from '@/components/icons';

type Platform = 'BALE' | 'RUBIKA';

const PLATFORM_INFO: Record<Platform, { label: string; hint: string }> = {
  BALE: {
    label: 'بله',
    hint: 'بات بله یک بات مشترک است که فروش‌یار آن را مدیریت می‌کند؛ نیازی به وارد کردن توکن نیست. کافی است اتصال را فعال کنید تا پیام‌های بله به همین دستیار برسند.',
  },
  RUBIKA: {
    label: 'روبیکا',
    hint: 'بات روبیکا یک بات مشترک است که فروش‌یار آن را مدیریت می‌کند؛ نیازی به وارد کردن توکن نیست. کافی است اتصال را فعال کنید.',
  },
};

/**
 * اتصال یک کانال پیام‌رسان ایرانی (بله یا روبیکا) — هر پلتفرم مودال جدا دارد.
 * `platform` مشخص می‌کند فقط همان پلتفرم نمایش داده شود.
 *
 * توکن بات مشترک است و فقط از env یا پنل ادمین تنظیم می‌شود؛ فروشنده فقط
 * اتصال را فعال می‌کند و هیچ توکنی وارد نمی‌کند.
 */
export function ChannelConnect({ platform, onChanged }: { platform: Platform; onChanged?: () => void }) {
  const toast = useToast();
  const [connections, setConnections] = useState<ChannelConnection[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [displayName, setDisplayName] = useState('بات فروشگاه');
  const [shopLink, setShopLink] = useState<string | null>(null);
  const [shopLinkConfigured, setShopLinkConfigured] = useState(false);
  const info = PLATFORM_INFO[platform];

  const load = () => {
    api.channels().then(all => setConnections(all.filter(c => c.platform === platform))).catch(() => setConnections([]));
    api.channelShopLink(platform)
      .then(result => { setShopLink(result.link); setShopLinkConfigured(Boolean(result.botUsername)); })
      .catch(() => { setShopLink(null); setShopLinkConfigured(false); });
  };

  useEffect(load, [platform]);

  const copyLink = async () => {
    if (!shopLink) return;
    try {
      await navigator.clipboard.writeText(shopLink);
      toast.success('لینک فروشگاه کپی شد.');
    } catch {
      toast.error('کپی نشد', 'دسترسی به حافظه ندارید.');
    }
  };

  async function disconnect(connection: ChannelConnection) {
    setBusy(true);
    try {
      await api.disconnectChannel(connection.id);
      toast.success('اتصال قطع شد.');
      load();
      onChanged?.();
    } catch (problem) {
      toast.error('قطع اتصال انجام نشد', problem instanceof ApiError ? problem.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  async function activate() {
    setBusy(true);
    try {
      await api.connectChannel({ platform, externalId: 'bot', displayName: displayName.trim() || 'بات فروشگاه' });
      toast.success(`${info.label} وصل شد.`);
      load();
      onChanged?.();
    } catch (problem) {
      toast.error('اتصال انجام نشد', problem instanceof ApiError ? problem.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  const isConnected = Boolean(connections?.some(connection => connection.status === 'CONNECTED' || connection.status === 'ACTIVE'));

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {connections === null && <SkeletonBlock height={60} />}
      {connections !== null && connections.length === 0 && (
        <p className="small muted" style={{ margin: 0, lineHeight: 1.9 }}>{info.hint}</p>
      )}
      {connections?.map(connection => (
        <div key={connection.id} className="row-between" style={{ border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px' }}>
          <div>
            <div className="strong" style={{ fontSize: 'var(--fs-sm)' }}>
              {connection.displayName || connection.username || connection.externalId}
            </div>
            <div className="small muted">
              {connection.status === 'CONNECTED' ? 'وصل است' : connection.status === 'DISCONNECTED' ? 'قطع شده' : connection.status}
              {connection.lastError ? ` · ${connection.lastError}` : ''}
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void disconnect(connection)} style={{ color: 'var(--danger)' }}>
            قطع اتصال
          </button>
        </div>
      ))}
      {!isConnected && connections !== null && (
        <Field label="نام نمایشی بات" htmlFor={`channel-name-${platform}`}>
          <input
            id={`channel-name-${platform}`}
            className="input"
            maxLength={200}
            placeholder="بات فروشگاه من"
            value={displayName}
            onChange={event => setDisplayName(event.target.value)}
          />
        </Field>
      )}
      {!isConnected && (
        <button className="btn btn-primary" onClick={() => void activate()} disabled={busy || connections === null} style={{ width: '100%' }}>
          {busy ? <Spinner size={15} /> : <IconPlus size={15} />}فعال‌سازی اتصال {info.label}
        </button>
      )}

      {isConnected && !shopLink && !shopLinkConfigured && (
        <div className="alert alert-warn" role="status">
          <IconAlertCircle />
          <span>اتصال فعال است؛ برای ساخت لینک مشتری، مدیر سامانه باید نام کاربری بات {info.label} را در تنظیمات پیام‌رسان‌ها ثبت کند.</span>
        </div>
      )}
      {isConnected && shopLink && (
        <div style={{ display: 'grid', gap: 8 }}>
          <div className="small muted">لینک فروشگاه برای مشتریان {info.label}:</div>
          <div className="row" style={{ gap: 8 }}>
            <input
              className="input input-ltr mono"
              readOnly
              dir="ltr"
              value={shopLink}
              onFocus={event => event.currentTarget.select()}
              aria-label={`لینک فروشگاه در ${info.label}`}
              style={{ flex: 1, minWidth: 0 }}
            />
            <button className="btn btn-outline" onClick={() => void copyLink()} type="button">
              <IconCopy size={15} />کپی
            </button>
          </div>
          <p className="small muted" style={{ margin: 0, lineHeight: 1.9 }}>
            این لینک را در بیو یا پست‌ها بگذارید؛ هر مشتری که آن را باز کند به همین فروشگاه وصل می‌شود.
          </p>
        </div>
      )}

    </div>
  );
}
