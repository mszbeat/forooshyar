'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import { Spinner } from '@/components/ui';
import { IconCheck, IconRefresh, IconAlertCircle } from '@/components/icons';

export type ProbeResult = {
  tone: 'ok' | 'bad';
  lines: { label: string; value: string }[];
  /** پیام کوتاه و خوانا برای آدم؛ متن خام در `detail` می‌آید. */
  error?: string;
  /** بدنه‌ی خام پاسخ ارائه‌دهنده (JSON/HTML) — در یک جعبه‌ی جدا و اسکرول‌دار. */
  detail?: string;
  statusText?: string;
};

/**
 * خطای درگاه را از دل متن خام بیرون می‌کشد.
 *
 * چرا: درگاه‌ها خطا را به شکل `HTTP 400 {"error":{"message":"…","user_id":"…"}}`
 * برمی‌گردانند. نشان‌دادن همان رشته در کارت، خط بلند و بی‌فایده‌ای می‌ساخت که از
 * عرض کارت بیرون می‌زد و روی کارت همسایه می‌افتاد. اینجا پیامِ قابل‌خواندن جدا
 * می‌شود و بقیه (شناسه‌ی درخواست و…) در جزئیات می‌ماند.
 */
export function splitProviderError(raw: string): { headline: string; detail: string; code: string } {
  const text = (raw ?? '').trim();
  const codeMatch = text.match(/^(?:HTTP\s*)?(\d{3})\b/);
  const code = codeMatch?.[1] ?? '';
  const jsonStart = text.indexOf('{');
  let message = '';
  let detail = '';
  if (jsonStart !== -1) {
    const jsonText = text.slice(jsonStart);
    try {
      const parsed = JSON.parse(jsonText) as { error?: { message?: string; code?: unknown } | string; message?: string };
      const nested = parsed.error;
      message = typeof nested === 'string' ? nested : (nested?.message ?? parsed.message ?? '');
      detail = JSON.stringify(parsed, null, 2);
    } catch {
      detail = jsonText;
    }
  }
  if (!message) {
    // پیام غیر JSON (مثلاً متن HTML یا خطای شبکه): فقط خط اول را نشان می‌دهیم.
    const firstLine = text.split('\n').find(line => line.trim() && !/^(HTTP\s*)?\d{3}/.test(line.trim())) ?? text;
    message = firstLine.replace(/\s+/g, ' ').slice(0, 220);
  }
  return {
    headline: message || 'درگاه پاسخ معتبری برنگرداند.',
    detail: detail || (text.length > message.length ? text : ''),
    code,
  };
}

/**
 * یک کارت «سرویس» با دکمه‌ی آزمون اتصال.
 *
 * آزمون‌ها همیشه سمت سرور اجرا می‌شوند (کلاینت مرورگر به تلگرام یا مدل دسترسی
 * ندارد و نباید کلید را ببیند)؛ اینجا فقط نتیجه نمایش داده می‌شود.
 */
/**
 * نتیجه‌ی آزمون، به‌صورت یک بلوک مستقل.
 *
 * چرا از کارت جدا شد: نتیجه‌ی یک آزمون طولانی است (چند خط + متن خام درگاه).
 * وقتی داخل کارت رندر می‌شد، کارتِ همان ستون کشیده می‌شد و کارت همسایه هم با
 * آن جابه‌جا می‌شد؛ کاربر دقیقاً همین را گزارش کرد. حالا نتیجه در ردیفِ
 * تمام‌عرضِ پایین می‌نشیند و کارت‌های بالا دست‌نخورده می‌مانند.
 */
export function ProbeResultPanel({ result, title }: { result: ProbeResult; title?: string }) {
  const ok = result.tone === 'ok';
  return (
    <div className={`probe-result ${ok ? 'ok' : 'bad'}`} role="status">
      <div className="probe-result-head">
        <span className="probe-result-ico">{ok ? <IconCheck size={16} /> : <IconAlertCircle size={16} />}</span>
        <div className="probe-result-head-main">
          <div className="probe-result-title">{title || (ok ? 'اتصال برقرار است' : 'اتصال ناموفق بود')}</div>
          {result.lines.length > 0 && (
            <div className="probe-result-sub">{result.lines.length} شاخص بررسی شد</div>
          )}
        </div>
      </div>
      {result.lines.length > 0 && (
        <div className="probe-result-list">
          {result.lines.map(line => {
            const isLtr = /[a-zA-Z0-9]/.test(line.value) && !/[؀-ۿ]/.test(line.value);
            return (
              <div key={line.label} className="probe-result-row">
                <span className="k">{line.label}</span>
                <span className={`v${isLtr ? ' ltr' : ''}`}>{line.value}</span>
              </div>
            );
          })}
        </div>
      )}
      {result.error && (
        <div className="probe-result-error">
          <div className="probe-result-error-head">
            {result.statusText && <span className="adm-tag t-restart num">{result.statusText}</span>}
            <span className="probe-result-error-msg">{result.error}</span>
          </div>
          {result.detail && <div className="probe-detail">{result.detail}</div>}
        </div>
      )}
    </div>
  );
}

export function ServiceCard({
  title, subtitle, icon, status, statusTone, meta, onProbe, probeLabel = 'تست اتصال', footer, onResult,
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
  /**
   * اگر بدهید، نتیجه در کارت رندر نمی‌شود و به والد سپرده می‌شود تا در ردیف
   * تمام‌عرض خودش بنشیند (صفحه‌ی مدل هوش مصنوعی).
   */
  onResult?: (result: ProbeResult | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ProbeResult | null>(null);

  async function run() {
    if (!onProbe || busy) return;
    setBusy(true);
    setResult(null);
    onResult?.(null);
    try {
      const next = await onProbe();
      setResult(next);
      onResult?.(next);
    } catch (problem) {
      const split = splitProviderError(problem instanceof Error ? problem.message : '');
      const failed: ProbeResult = { tone: 'bad', lines: [], error: split.headline, detail: split.detail, statusText: split.code };
      setResult(failed);
      onResult?.(failed);
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

      {result && !onResult && <ProbeResultPanel result={result} />}
    </section>
  );
}
