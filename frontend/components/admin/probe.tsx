'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import { Spinner } from '@/components/ui';
import { IconCheck, IconRefresh, IconAlertCircle } from '@/components/icons';

export type ProbeResult = { tone: 'ok' | 'bad'; lines: { label: string; value: string }[]; error?: string };

/**
 * یک کارت «سرویس» با دکمه‌ی آزمون اتصال.
 *
 * آزمون‌ها همیشه سمت سرور اجرا می‌شوند (کلاینت مرورگر به تلگرام یا مدل دسترسی
 * ندارد و نباید کلید را ببیند)؛ اینجا فقط نتیجه نمایش داده می‌شود.
 */
export function ServiceCard({
  title, subtitle, icon, status, statusTone, meta, onProbe, probeLabel = 'تست اتصال', footer,
}: {
  title: string;
  subtitle: string;
  icon: ReactNode;
  status: string;
  statusTone: 'on' | 'off' | 'warn';
  meta: { label: string; value: string }[];
  onProbe?: () => Promise<ProbeResult>;
  probeLabel?: string;
  footer?: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ProbeResult | null>(null);

  async function run() {
    if (!onProbe || busy) return;
    setBusy(true);
    setResult(null);
    try {
      setResult(await onProbe());
    } catch (problem) {
      setResult({ tone: 'bad', lines: [], error: problem instanceof Error ? problem.message : 'آزمون انجام نشد.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card card-pad" style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
      <div className="row" style={{ gap: 10 }}>
        <span className="stat-ico">{icon}</span>
        <div style={{ minWidth: 0 }}>
          <div className="card-title" style={{ margin: 0 }}>{title}</div>
          <div className="card-desc">{subtitle}</div>
        </div>
        <span className={`adm-pipe ${statusTone}`} style={{ marginInlineStart: 'auto' }}><i /><span className="mono">{status}</span></span>
      </div>

      <div className="stack" style={{ gap: 6 }}>
        {meta.map(item => (
          <div className="row-between" key={item.label} style={{ gap: 10 }}>
            <span className="small muted">{item.label}</span>
            <span className="small ltr" style={{ fontFamily: 'var(--font-mono, monospace)' }}>{item.value}</span>
          </div>
        ))}
      </div>

      {onProbe && (
        <div className="row" style={{ gap: 8 }}>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => void run()} disabled={busy}>
            {busy ? <Spinner size={13} /> : <IconRefresh size={13} />}
            {probeLabel}
          </button>
          {footer}
        </div>
      )}
      {!onProbe && footer}

      {result && (
        <div className={`adm-note ${result.tone === 'ok' ? 'ok' : 'bad'}`}>
          {result.tone === 'ok' ? <IconCheck size={16} /> : <IconAlertCircle size={16} />}
          <div style={{ display: 'grid', gap: 4 }}>
            {result.lines.map(line => (
              <div key={line.label} className="row-between" style={{ gap: 10 }}>
                <span>{line.label}</span>
                <b className="num ltr">{line.value}</b>
              </div>
            ))}
            {result.error && <span>{result.error}</span>}
          </div>
        </div>
      )}
    </section>
  );
}
