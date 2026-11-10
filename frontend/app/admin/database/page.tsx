'use client';

import { useEffect, useState } from 'react';
import { adminApi, type DatabaseProbe } from '@/lib/admin';
import { SettingsPanel } from '@/components/admin/settings-panel';
import { Spinner, useToast } from '@/components/ui';
import { faNum } from '@/lib/format';
import { IconAlertCircle, IconCheck, IconInfo, IconRefresh, IconStore } from '@/components/icons';

type Info = { latencyMs: number; version: string; size: string; tables: number; migrations: { name: string; at: string | null }[] };

export default function AdminDatabasePage() {
  const toast = useToast();
  const [info, setInfo] = useState<Info | null>(null);
  const [candidate, setCandidate] = useState('');
  const [probe, setProbe] = useState<DatabaseProbe | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    adminApi.database().then(setInfo).catch(() => setInfo(null));
  }
  useEffect(load, []);

  async function test() {
    setBusy(true);
    setProbe(null);
    try {
      setProbe(await adminApi.probeDatabase(candidate.trim() || undefined));
    } catch (problem) {
      toast.error('آزمون انجام نشد', problem instanceof Error ? problem.message : 'خطای نامشخص');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="grid g-2" style={{ gap: 14 }}>
        <section className="card card-pad" style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
          <div className="row" style={{ gap: 10 }}>
            <span className="stat-ico"><IconStore size={15} /></span>
            <div>
              <div className="card-title" style={{ margin: 0 }}>وضعیت اتصال جاری</div>
              <div className="card-desc">همان اتصالی که سرویس با آن بالا آمده است</div>
            </div>
            <button type="button" className="btn btn-ghost btn-icon btn-sm" style={{ marginInlineStart: 'auto' }} onClick={load} aria-label="بازخوانی">
              <IconRefresh size={14} />
            </button>
          </div>

          {info ? (
            <div className="adm-kpis">
              <div className="adm-kpi k-ok"><span className="lb">تأخیر</span><span className="vl num"><span className="ltr">{faNum(info.latencyMs)}ms</span></span><span className="ft">ping</span></div>
              <div className="adm-kpi"><span className="lb">حجم</span><span className="vl" style={{ fontSize: 16 }}>{info.size}</span><span className="ft">{faNum(info.tables)} جدول</span></div>
              <div className="adm-kpi"><span className="lb">نسخه</span><span className="vl" style={{ fontSize: 14 }}>{info.version}</span><span className="ft">postgres</span></div>
            </div>
          ) : (
            <div className="adm-note">وضعیت دیتابیس در دسترس نیست.</div>
          )}

          <div>
            <div className="card-desc" style={{ marginBottom: 8 }}>مهاجرت‌های اعمال‌شده</div>
            <div style={{ display: 'grid', gap: 6 }}>
              {(info?.migrations ?? []).map(migration => (
                <div key={migration.name} className="row-between" style={{ gap: 10 }}>
                  <span className="small ltr" style={{ fontFamily: 'var(--font-mono, monospace)' }}>{migration.name}</span>
                  <span className="adm-tag">{migration.at ? new Date(migration.at).toLocaleDateString('fa-IR') : '—'}</span>
                </div>
              ))}
              {!info?.migrations.length && <span className="small muted">مهاجرتی ثبت نشده است.</span>}
            </div>
          </div>
        </section>

        <section className="card card-pad" style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
          <div className="row" style={{ gap: 10 }}>
            <span className="stat-ico"><IconInfo size={15} /></span>
            <div>
              <div className="card-title" style={{ margin: 0 }}>آزمون یک آدرس دیگر</div>
              <div className="card-desc">بدون تغییر اتصال فعلی؛ فقط یک اتصال آزمایشی</div>
            </div>
          </div>

          <input
            className="input input-ltr" type="text" spellCheck={false}
            placeholder="postgresql://user:pass@host:5432/db?schema=public"
            value={candidate} onChange={event => setCandidate(event.target.value)}
            aria-label="آدرس آزمایشی"
          />
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => void test()} disabled={busy}>
              {busy ? <Spinner size={14} /> : <IconRefresh size={14} />}
              آزمون اتصال
            </button>
            <span className="small muted">خالی بگذارید تا اتصال فعلی آزمون شود.</span>
          </div>

          {probe && (
            <div className={`adm-note ${probe.ok ? 'ok' : 'bad'}`}>
              {probe.ok ? <IconCheck size={16} /> : <IconAlertCircle size={16} />}
              <div style={{ display: 'grid', gap: 4 }}>
                {probe.ok ? (
                  <>
                    <span>اتصال برقرار شد در {faNum(probe.latencyMs)} میلی‌ثانیه.</span>
                    <span className="small">نسخه {probe.version} · {faNum(probe.shops)} فروشگاه · {faNum(probe.products)} محصول</span>
                  </>
                ) : (
                  <span>{probe.error}</span>
                )}
              </div>
            </div>
          )}

          <div className="adm-note warn">
            <IconAlertCircle size={16} />
            <span>
              تغییر <b className="num">DATABASE_URL</b> فقط بعد از ری‌استارت اثر می‌کند و دیتابیس مقصد باید
              از قبل مهاجرت شده باشد؛ وگرنه سرویس بالا نمی‌آید. پیش از هر تغییر، از دیتابیس فعلی پشتیبان بگیرید
              (<b className="num">deploy/backup-db.sh</b>).
            </span>
          </div>
        </section>
      </div>

      <SettingsPanel group="database" />
    </>
  );
}
