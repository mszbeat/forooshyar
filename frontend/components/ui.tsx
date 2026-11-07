'use client';

import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { IconAlertCircle, IconCheckCircle, IconX } from './icons';

/* ------------------------------------------------------------------ Toasts */

type Tone = 'success' | 'error' | 'info';
type Toast = { id: number; tone: Tone; title: string; message?: string };
type ToastApi = { push: (tone: Tone, title: string, message?: string) => void; success: (title: string, message?: string) => void; error: (title: string, message?: string) => void };

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const counter = useRef(0);

  const push = useCallback((tone: Tone, title: string, message?: string) => {
    const id = ++counter.current;
    setItems(list => [...list, { id, tone, title, message }]);
    window.setTimeout(() => setItems(list => list.filter(item => item.id !== id)), 4600);
  }, []);

  const api = useMemo<ToastApi>(() => ({
    push,
    success: (title, message) => push('success', title, message),
    error: (title, message) => push('error', title, message),
  }), [push]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-host" role="status" aria-live="polite">
        {items.map(item => (
          <div key={item.id} className={`toast toast-${item.tone}`}>
            {item.tone === 'success' ? <IconCheckCircle className="toast-ico" /> : <IconAlertCircle className="toast-ico" />}
            <div>
              <div className="toast-title">{item.title}</div>
              {item.message && <div className="toast-msg">{item.message}</div>}
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside <ToastProvider>');
  return context;
}

/* ------------------------------------------------------------------- Modal */

export function Modal({
  open, onClose, title, description, children, footer, size = 'md', closeOnBackdrop = true,
}: {
  open: boolean; onClose: () => void; title: string; description?: string;
  children: ReactNode; footer?: ReactNode; size?: 'md' | 'lg'; closeOnBackdrop?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = previous; };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="overlay" onMouseDown={event => { if (closeOnBackdrop && event.target === event.currentTarget) onClose(); }}>
      <div className={`modal ${size === 'lg' ? 'modal-lg' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <div>
            <h2 className="modal-title">{title}</h2>
            {description && <p className="modal-desc">{description}</p>}
          </div>
          <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="بستن">
            <IconX size={16} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- Field */

export function Field({
  label, hint, error, required, children, htmlFor,
}: { label: string; hint?: string; error?: string; required?: boolean; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="field">
      <label className="field-label" htmlFor={htmlFor}>
        {label}
        {required && <span className="req" aria-hidden="true">*</span>}
      </label>
      {children}
      {error ? <span className="field-error">{error}</span> : hint ? <span className="field-hint">{hint}</span> : null}
    </div>
  );
}

/* --------------------------------------------------------------- StatCard */

export function StatCard({
  icon, label, value, unit, foot, tone,
}: { icon: ReactNode; label: string; value: string; unit?: string; foot?: ReactNode; tone?: 'brand' | 'amber' | 'danger' }) {
  const style = tone === 'amber'
    ? { background: 'var(--amber-soft)', color: 'var(--amber)', borderColor: 'var(--amber-line)' }
    : tone === 'danger'
      ? { background: 'var(--danger-soft)', color: 'var(--danger)', borderColor: 'var(--danger-line)' }
      : undefined;
  return (
    <div className="stat">
      <div className="stat-top">
        <span className="stat-ico" style={style}>{icon}</span>
        <span className="stat-label">{label}</span>
      </div>
      <div className="stat-value">{value}{unit && <small>{unit}</small>}</div>
      {foot && <div className="stat-foot">{foot}</div>}
    </div>
  );
}

/* ------------------------------------------------------------- EmptyState */

export function EmptyState({ icon, title, description, action }: { icon: ReactNode; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-ico">{icon}</div>
      <div className="empty-title">{title}</div>
      {description && <p className="empty-desc">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

/* ---------------------------------------------------------------- Skeleton */

export function SkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="list" aria-busy="true">
      {Array.from({ length: rows }).map((_, index) => (
        <div className="list-row" key={index}>
          <div className="skeleton" style={{ width: 34, height: 34, borderRadius: 'var(--r-xs)' }} />
          <div className="list-main" style={{ display: 'grid', gap: 8 }}>
            <div className="skeleton" style={{ height: 11, width: `${58 - index * 6}%` }} />
            <div className="skeleton" style={{ height: 9, width: '34%' }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SkeletonBlock({ height = 120 }: { height?: number }) {
  return <div className="skeleton" style={{ height, borderRadius: 'var(--r-sm)' }} aria-busy="true" />;
}

/* ---------------------------------------------------------------- Spinner */

export function Spinner({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="spin" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.22" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/* --------------------------------------------------------------- Segmented */

export function Segmented<T extends string>({ value, options, onChange, ariaLabel }: {
  value: T; options: { value: T; label: string }[]; onChange: (value: T) => void; ariaLabel?: string;
}) {
  return (
    <div className="segmented" role="tablist" aria-label={ariaLabel}>
      {options.map(option => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={option.value === value}
          className={option.value === value ? 'on' : ''}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ Switch */

export function Switch({ checked, onChange, label, id }: { checked: boolean; onChange: (next: boolean) => void; label: string; id?: string }) {
  const auto = useId();
  const inputId = id ?? auto;
  return (
    <label htmlFor={inputId} style={{ display: 'inline-flex', alignItems: 'center', gap: 9, cursor: 'pointer', fontSize: 'var(--fs-sm)' }}>
      <input
        id={inputId}
        type="checkbox"
        checked={checked}
        onChange={event => onChange(event.target.checked)}
        style={{ appearance: 'none', width: 38, height: 22, borderRadius: 999, background: checked ? 'var(--brand)' : 'var(--line-strong)', position: 'relative', cursor: 'pointer', transition: 'background .18s', margin: 0 }}
        className="switch-input"
      />
      <span>{label}</span>
      <style>{`.switch-input::after{content:'';position:absolute;top:3px;inset-inline-end:${checked ? '19px' : '3px'};width:16px;height:16px;border-radius:50%;background:#fff;transition:inset-inline-end .18s var(--ease);box-shadow:0 1px 2px rgba(0,0,0,.2)}`}</style>
    </label>
  );
}

/* ------------------------------------------------------------- PageHeader */

export function PageHeader({ title, description, eyebrow, actions }: { title: string; description?: string; eyebrow?: string; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        {eyebrow && <div className="page-eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="page-head-actions">{actions}</div>}
    </div>
  );
}
