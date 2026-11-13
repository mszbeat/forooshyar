'use client';

import { useEffect, useState } from 'react';
import { api, ApiError, type ChannelConnection } from '@/lib/api';
import { Field, Modal, SkeletonBlock, Spinner, useToast } from '@/components/ui';
import { IconAlertCircle, IconCheckCircle, IconCopy, IconPlus } from '@/components/icons';

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
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [shopLink, setShopLink] = useState<string | null>(null);
  const info = PLATFORM_INFO[platform];

  const load = () => {
    api.channels().then(all => setConnections(all.filter(c => c.platform === platform))).catch(() => setConnections([]));
    api.channelShopLink(platform).then(result => setShopLink(result.link)).catch(() => setShopLink(null));
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
      <button className="btn btn-primary" onClick={() => setOpen(true)} style={{ width: '100%' }}>
        <IconPlus size={15} />اتصال {info.label}
      </button>

      {shopLink && (
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

      {open && (
        <ConnectModal
          platform={platform}
          onClose={() => setOpen(false)}
          onSaved={() => { setOpen(false); load(); onChanged?.(); }}
        />
      )}
    </div>
  );
}

function ConnectModal({ platform, onClose, onSaved }: { platform: Platform; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const info = PLATFORM_INFO[platform];

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    try {
      await api.connectChannel({
        platform,
        externalId: 'bot',
        displayName: String(data.get('displayName') ?? '').trim(),
      });
      toast.success(`${info.label} وصل شد.`);
      onSaved();
    } catch (problem) {
      toast.error('اتصال انجام نشد', problem instanceof ApiError ? problem.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open onClose={onClose} title={`اتصال ${info.label}`}
      description={info.hint}
      footer={<><button className="btn btn-ghost" onClick={onClose}>انصراف</button><button className="btn btn-primary" form="channel-form" disabled={busy}>{busy && <Spinner size={14} />}فعال‌سازی اتصال</button></>}
    >
      <form id="channel-form" onSubmit={submit} style={{ display: 'grid', gap: 14 }}>
        <Field label="نام نمایشی بات" htmlFor="displayName">
          <input id="displayName" name="displayName" className="input" maxLength={200} placeholder="بات فروشگاه من" autoFocus />
        </Field>
        <div className="alert alert-info">
          <IconCheckCircle />
          <span>توکن بات {info.label} را فروش‌یار تنظیم می‌کند؛ شما فقط اتصال را فعال می‌کنید. بعد از فعال‌سازی، یک پیام آزمایشی به بات بفرستید تا مطمئن شوید وصل است.</span>
        </div>
        <div className="alert alert-info">
          <IconAlertCircle />
          <span>مشتری‌ها از لینک فروشگاه وارد بات می‌شوند؛ پیام‌هایشان مستقیم به همین پنل می‌آید.</span>
        </div>
      </form>
    </Modal>
  );
}
