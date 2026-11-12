'use client';

import { useEffect, useState } from 'react';
import { api, ApiError, type ChannelConnection } from '@/lib/api';
import { Field, Modal, PageHeader, SkeletonBlock, Spinner, useToast } from '@/components/ui';
import { IconAlertCircle, IconCheckCircle, IconPlus } from '@/components/icons';

type Platform = 'BALE' | 'RUBIKA';

const PLATFORM_INFO: Record<Platform, { label: string; hint: string; tokenHint: string }> = {
  BALE: {
    label: 'بله',
    hint: 'بات بله را از @BotFather بسازید و توکنش را این‌جا بگذارید. پیام‌های بله مثل تلگرام به همین دستیار می‌رسند.',
    tokenHint: 'توکن بات بله (از @BotFather).',
  },
  RUBIKA: {
    label: 'روبیکا',
    hint: 'بات روبیکا را از بخش بات‌های روبیکا بسازید و توکنش را این‌جا بگذارید.',
    tokenHint: 'توکن بات روبیکا.',
  },
};

/**
 * اتصال یک کانال پیام‌رسان ایرانی (بله یا روبیکا) — هر پلتفرم مودال جدا دارد.
 * `platform` مشخص می‌کند فقط همان پلتفرم نمایش داده شود.
 */
export function ChannelConnect({ platform, onChanged }: { platform: Platform; onChanged?: () => void }) {
  const toast = useToast();
  const [connections, setConnections] = useState<ChannelConnection[] | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const info = PLATFORM_INFO[platform];

  const load = () => {
    api.channels().then(all => setConnections(all.filter(c => c.platform === platform))).catch(() => setConnections([]));
  };

  useEffect(load, [platform]);

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
              {connection.hasSecret ? ' · توکن ثبت شده' : ''}
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
    const secret = String(data.get('secret') ?? '').trim();
    const externalId = String(data.get('externalId') ?? '').trim();
    if (!secret && !externalId) {
      toast.error('توکن بات یا شناسه‌ی حساب لازم است.');
      return;
    }
    setBusy(true);
    try {
      await api.connectChannel({
        platform,
        externalId: externalId || 'bot',
        displayName: String(data.get('displayName') ?? '').trim(),
        secret: secret || undefined,
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
      footer={<><button className="btn btn-ghost" onClick={onClose}>انصراف</button><button className="btn btn-primary" form="channel-form" disabled={busy}>{busy && <Spinner size={14} />}اتصال</button></>}
    >
      <form id="channel-form" onSubmit={submit} style={{ display: 'grid', gap: 14 }}>
        <Field label="نام نمایشی بات" htmlFor="displayName">
          <input id="displayName" name="displayName" className="input" maxLength={200} placeholder="بات فروشگاه من" />
        </Field>
        <Field label="توکن بات" required htmlFor="secret" hint="توکن فقط رمزنگاری‌شده ذخیره می‌شود و هرگز در پاسخ‌ها دیده نمی‌شود.">
          <input id="secret" name="secret" className="input input-ltr" required maxLength={500} placeholder="123456:ABC-DEF…" autoFocus />
        </Field>
        <Field label="شناسه‌ی حساب (اختیاری)" htmlFor="externalId" hint="اگر خالی بماند، «bot» ثبت می‌شود؛ برای چند بات در یک فروشگاه شناسه‌ی یکتا بگذارید.">
          <input id="externalId" name="externalId" className="input input-ltr" maxLength={200} placeholder="my-shop-bot" />
        </Field>
        <div className="alert alert-info">
          <IconAlertCircle />
          <span>بعد از اتصال، یک پیام آزمایشی به بات بفرستید تا مطمئن شوید webhook وصل است.</span>
        </div>
      </form>
    </Modal>
  );
}
