'use client';

import { useEffect, useState } from 'react';
import { api, ApiError, type Automation } from '@/lib/api';
import { Field, Modal, SkeletonBlock, Spinner, Switch, useToast } from '@/components/ui';
import { IconAlertCircle, IconCheckCircle, IconPlus } from '@/components/icons';

/**
 * اتوماسیون کامنت → دایرکت اینستاگرام.
 * مشتری زیر پست کامنت می‌گذارد؛ پاسخ عمومی داده می‌شود و بعد DM می‌رود.
 */
export function AutomationSection() {
  const toast = useToast();
  const [automations, setAutomations] = useState<Automation[] | null>(null);
  const [editing, setEditing] = useState<Automation | 'new' | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => {
    api.automations().then(setAutomations).catch(() => setAutomations([]));
  };

  useEffect(load, []);

  async function toggle(automation: Automation, active: boolean) {
    setBusy(true);
    try {
      await api.updateAutomation(automation.id, { active });
      toast.success(active ? 'اتوماسیون فعال شد.' : 'اتوماسیون غیرفعال شد.');
      load();
    } catch (problem) {
      toast.error('تغییر وضعیت انجام نشد', problem instanceof ApiError ? problem.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  async function remove(automation: Automation) {
    setBusy(true);
    try {
      await api.deleteAutomation(automation.id);
      toast.success('اتوماسیون حذف شد.');
      load();
    } catch (problem) {
      toast.error('حذف انجام نشد', problem instanceof ApiError ? problem.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <div className="card-head">
        <div className="row" style={{ gap: 10 }}>
          <span className="stat-ico"><IconCheckCircle size={15} /></span>
          <div>
            <div className="card-title">اتوماسیون کامنت به دایرکت</div>
            <div className="card-desc">وقتی مشتری زیر پست کامنت می‌گذارد، پاسخ عمومی می‌گیرد و بعد دایرکت می‌رود.</div>
          </div>
        </div>
        <span className="card-index num">۰۶</span>
      </div>
      <div className="card-body" style={{ display: 'grid', gap: 14 }}>
        {automations === null && <SkeletonBlock height={60} />}
        {automations !== null && automations.length === 0 && (
          <div className="alert alert-info">
            <IconAlertCircle />
            <span>هنوز اتوماسیونی ساخته نشده. با یک اتوماسیون، کامنت «قیمت؟» خودکار به دایرکت می‌رسد و مشتری همان‌جا سفارش می‌دهد.</span>
          </div>
        )}
        {automations?.map(automation => (
          <div key={automation.id} className="row-between" style={{ border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px' }}>
            <div>
              <div className="strong" style={{ fontSize: 'var(--fs-sm)' }}>{automation.name}</div>
              <div className="small muted">
                {automation.scope === 'ALL' ? 'همه‌ی پست‌ها' : `${automation.mediaIds.length} پست منتخب`}
                {automation.triggerWords.length > 0 && ` · تریگر: ${automation.triggerWords.join('، ')}`}
                {automation.requireFollow && ' · اول فالو کن'}
              </div>
            </div>
            <div className="row" style={{ gap: 6 }}>
              <Switch label="فعال" checked={automation.active} onChange={next => void toggle(automation, next)} />
              <button className="btn btn-outline btn-sm" disabled={busy} onClick={() => setEditing(automation)}>ویرایش</button>
              <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void remove(automation)} style={{ color: 'var(--danger)' }}>حذف</button>
            </div>
          </div>
        ))}
        <button className="btn btn-outline btn-sm" onClick={() => setEditing('new')}>
          <IconPlus size={14} />اتوماسیون جدید
        </button>
      </div>

      {editing && (
        <AutomationModal
          automation={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </section>
  );
}

function AutomationModal({ automation, onClose, onSaved }: { automation: Automation | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [testText, setTestText] = useState('');
  const [testResult, setTestResult] = useState<boolean | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const split = (value: string) => value.split(/[\n،,]/).map(item => item.trim()).filter(Boolean);
    const body = {
      name: String(data.get('name') ?? '').trim(),
      scope: String(data.get('scope') ?? 'ALL') as 'ALL' | 'SELECTED',
      mediaIds: split(String(data.get('mediaIds') ?? '')),
      triggerWords: split(String(data.get('triggerWords') ?? '')),
      publicReplies: split(String(data.get('publicReplies') ?? '')),
      dmTemplate: String(data.get('dmTemplate') ?? '').trim(),
      requireFollow: String(data.get('requireFollow') ?? '') === 'on',
      dailyCap: Number(data.get('dailyCap') ?? 200),
    };
    setBusy(true);
    try {
      if (automation) {
        await api.updateAutomation(automation.id, body);
        toast.success('اتوماسیون به‌روزرسانی شد.');
      } else {
        await api.createAutomation(body);
        toast.success('اتوماسیون ساخته شد.');
      }
      onSaved();
    } catch (problem) {
      toast.error('ذخیره انجام نشد', problem instanceof ApiError ? problem.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  async function testTrigger() {
    if (!automation || !testText.trim()) return;
    try {
      const result = await api.testAutomationTrigger(automation.id, testText);
      setTestResult(result.matched);
    } catch {
      setTestResult(null);
    }
  }

  return (
    <Modal
      open onClose={onClose} size="lg" title={automation ? 'ویرایش اتوماسیون' : 'اتوماسیون جدید'}
      description="کامنت‌هایی که تریگر بخورند، پاسخ عمومی می‌گیرند و بعد دایرکت می‌روند. هر کامنت فقط یک‌بار پردازش می‌شود."
      footer={<><button className="btn btn-ghost" onClick={onClose}>انصراف</button><button className="btn btn-primary" form="auto-form" disabled={busy}>{busy && <Spinner size={14} />}ذخیره</button></>}
    >
      <form id="auto-form" onSubmit={submit} style={{ display: 'grid', gap: 14 }}>
        <Field label="نام اتوماسیون" required htmlFor="auto-name">
          <input id="auto-name" name="name" className="input" required maxLength={200} defaultValue={automation?.name ?? 'کامنت قیمت → دایرکت'} autoFocus />
        </Field>
        <Field label="دامنه" htmlFor="auto-scope" hint="«منتخب» یعنی فقط پست‌هایی که شناسه‌شان را می‌نویسید.">
          <select id="auto-scope" name="scope" className="select" defaultValue={automation?.scope ?? 'ALL'}>
            <option value="ALL">همه‌ی پست‌ها</option>
            <option value="SELECTED">فقط پست‌های منتخب</option>
          </select>
        </Field>
        <Field label="شناسه‌ی پست‌ها (برای دامنه‌ی منتخب)" htmlFor="mediaIds" hint="با کاما یا خط جدید جدا کنید.">
          <input id="mediaIds" name="mediaIds" className="input input-ltr" defaultValue={(automation?.mediaIds ?? []).join(', ')} placeholder="1789…, 1790…" />
        </Field>
        <Field label="کلمات تریگر" htmlFor="triggerWords" hint="اگر کامنت یکی از این‌ها را داشته باشد، اتوماسیون اجرا می‌شود. خالی = همه‌ی کامنت‌ها.">
          <input id="triggerWords" name="triggerWords" className="input" defaultValue={(automation?.triggerWords ?? []).join('، ')} placeholder="قیمت، خرید، سفارش، موجوده؟" />
        </Field>
        <Field label="پاسخ عمومی کامنت (تا ۳ گونه)" htmlFor="publicReplies" hint="هر خط یک گونه؛ یکی به‌تصادف انتخاب می‌شود.">
          <textarea id="publicReplies" name="publicReplies" className="textarea" rows={3} defaultValue={(automation?.publicReplies ?? []).join('\n')} placeholder={'سلام! قیمت و موجودی را دایرکت می‌فرستم 🌿\nبرای سفارش دایرکت بدهید 🙏'} />
        </Field>
        <Field label="قالب پیام دایرکت" htmlFor="dmTemplate" hint="متغیرها: {shop_name} نام فروشگاه است.">
          <textarea id="dmTemplate" name="dmTemplate" className="textarea" rows={4} defaultValue={automation?.dmTemplate ?? ''} placeholder={'سلام! ممنون از کامنت‌تان 🌿\nبرای سفارش و اطلاعات بیشتر همین‌جا بنویسید.'} />
        </Field>
        <div className="row" style={{ gap: 16, flexWrap: 'wrap' }}>
          <label className="row" style={{ gap: 6 }}>
            <input type="checkbox" name="requireFollow" defaultChecked={automation?.requireFollow ?? false} />
            <span className="small">اول باید پیج را فالو کند</span>
          </label>
          <Field label="سقف پاسخ در روز" htmlFor="dailyCap">
            <input id="dailyCap" name="dailyCap" className="input input-ltr" type="number" min={1} max={10000} defaultValue={automation?.dailyCap ?? 200} />
          </Field>
        </div>

        {automation && (
          <div style={{ borderTop: '1px solid var(--line)', paddingTop: 14, display: 'grid', gap: 8 }}>
            <div className="kv-k">تست تریگر (بدون ارسال واقعی)</div>
            <div className="row" style={{ gap: 8 }}>
              <input className="input" placeholder="متن کامنت نمونه…" value={testText} onChange={event => setTestText(event.target.value)} />
              <button type="button" className="btn btn-outline btn-sm" onClick={() => void testTrigger()}>بررسی</button>
            </div>
            {testResult !== null && (
              <span className="small" style={{ color: testResult ? 'var(--ok, #0f7b4f)' : 'var(--danger, #b42318)' }}>
                {testResult ? '✓ این کامنت تریگر می‌خورد.' : '✗ این کامنت تریگر نمی‌خورد.'}
              </span>
            )}
          </div>
        )}
      </form>
    </Modal>
  );
}
