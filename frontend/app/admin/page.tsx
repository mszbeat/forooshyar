'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { adminApi, type Overview } from '@/lib/admin';
import { SkeletonRows, Spinner, useToast } from '@/components/ui';
import { ServiceCard } from '@/components/admin/probe';
import { faNum } from '@/lib/format';
import {
  IconAlertCircle, IconBolt, IconInfo, IconRefresh, IconSparkles, IconStore, IconWallet,
} from '@/components/icons';

const STATUS_FA: Record<string, string> = {
  AWAITING_PAYMENT: 'در انتظار پرداخت',
  PAID: 'پرداخت‌شده',
  SHIPPED: 'ارسال‌شده',
  COMPLETED: 'تکمیل‌شده',
  CANCELLED: 'لغو‌شده',
};

function ago(iso: string | null): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return 'همین حالا';
  if (minutes < 60) return `${faNum(minutes)} دقیقه پیش`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${faNum(hours)} ساعت پیش`;
  return `${faNum(Math.round(hours / 24))} روز پیش`;
}

export default function AdminOverviewPage() {
  const toast = useToast();
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function load() {
    setBusy(true);
    adminApi.overview()
      .then(overview => { setData(overview); setError(''); })
      .catch(problem => setError(problem instanceof Error ? problem.message : 'دریافت وضعیت انجام نشد.'))
      .finally(() => setBusy(false));
  }

  useEffect(load, []);

  async function restart() {
    if (!window.confirm('سرویس ری‌استارت می‌شود و چند ثانیه قطع خواهد بود. ادامه می‌دهید؟')) return;
    try {
      await adminApi.restart();
      toast.success('ری‌استارت شد', 'سرویس در حال بالا آمدن است؛ چند ثانیه بعد دوباره تلاش کنید.');
    } catch (problem) {
      toast.error('انجام نشد', problem instanceof Error ? problem.message : 'خطای نامشخص');
    }
  }

  if (!data) {
    return (
      <section className="card card-pad">
        {error ? <div className="adm-note bad"><IconAlertCircle size={16} /><span>{error}</span></div> : <SkeletonRows rows={6} />}
      </section>
    );
  }

  const { counts, services, runtime } = data;

  return (
    <>
      {data.restartRequired.length > 0 && (
        <div className="adm-note warn">
          <IconAlertCircle size={16} />
          <div style={{ display: 'grid', gap: 6 }}>
            <span>
              این تنظیمات ذخیره شده‌اند ولی اتصالشان از پیش ساخته شده بود، پس تا ری‌استارت اثر نمی‌کنند:
              <b> {data.restartRequired.join('، ')}</b>
            </span>
            <div>
              <button type="button" className="btn btn-warn btn-sm" onClick={() => void restart()}>ری‌استارت سرویس</button>
            </div>
          </div>
        </div>
      )}

      <section className="adm-kpis">
        <div className="adm-kpi">
          <span className="lb">فروشگاه‌ها</span>
          <span className="vl num">{faNum(counts.shops)}</span>
          <span className="ft">shops</span>
        </div>
        <div className="adm-kpi">
          <span className="lb">محصولات</span>
          <span className="vl num">{faNum(counts.products)}</span>
          <span className="ft">{faNum(counts.variants)} واریانت</span>
        </div>
        <div className="adm-kpi">
          <span className="lb">سفارش‌ها</span>
          <span className="vl num">{faNum(counts.orders)}</span>
          <span className="ft">{data.ordersByStatus.map(row => `${STATUS_FA[row.status] ?? row.status}: ${faNum(row.count)}`).slice(0, 2).join(' · ') || 'بدون سفارش'}</span>
        </div>
        <div className="adm-kpi k-ok">
          <span className="lb">گفتگوهای ربات</span>
          <span className="vl num">{faNum(counts.conversations)}</span>
          <span className="ft">{faNum(counts.messages)} پیام</span>
        </div>
        <div className={`adm-kpi ${counts.waiting > 0 ? 'k-warn' : ''}`}>
          <span className="lb">در انتظار شارژ</span>
          <span className="vl num">{faNum(counts.waiting)}</span>
          <span className="ft">waitlist</span>
        </div>
        <div className="adm-kpi">
          <span className="lb">آپ‌تایم</span>
          <span className="vl num">{faNum(Math.floor(runtime.uptimeSec / 60))}<small style={{ fontSize: 12, fontWeight: 600 }}> دقیقه</small></span>
          <span className="ft ltr">node {runtime.node} · {faNum(runtime.memoryMb)}MB</span>
        </div>
      </section>

      <div className="grid g-2" style={{ gap: 14 }}>
        <ServiceCard
          title="مدل هوش مصنوعی"
          subtitle="پاسخ به سؤال‌هایی که موتور قاعده‌محور نمی‌فهمد"
          icon={<IconSparkles size={15} />}
          status={services.ai.ready ? 'READY' : services.ai.enabled ? 'WAIT' : 'OFF'}
          statusTone={services.ai.ready ? 'on' : services.ai.enabled ? 'warn' : 'off'}
          meta={[
            { label: 'مدل', value: services.ai.model },
            { label: 'درگاه', value: services.ai.provider.replace(/^https?:\/\//, '') },
            { label: 'دلیل', value: services.ai.reason || 'آماده' },
          ]}
          onProbe={async () => {
            const probe = await adminApi.probeAi();
            return {
              tone: probe.ok ? 'ok' : 'bad',
              lines: [
                { label: 'مدل', value: probe.model },
                { label: 'زمان پاسخ', value: `${probe.latencyMs}ms` },
                ...(probe.sample ? [{ label: 'نمونه پاسخ', value: probe.sample.slice(0, 80) }] : []),
              ],
              error: probe.ok ? undefined : probe.error,
            };
          }}
          footer={<Link className="btn btn-ghost btn-sm" href="/admin/ai">تنظیمات مدل</Link>}
        />

        <ServiceCard
          title="ربات تلگرام"
          subtitle="webhook و پیام‌های مشتری"
          icon={<IconBolt size={15} />}
          status={services.telegram.configured ? 'ONLINE' : 'OFF'}
          statusTone={services.telegram.configured ? 'on' : 'off'}
          meta={[
            { label: 'آدرس Bot API', value: services.telegram.baseUrl.replace(/^https?:\/\//, '') },
            { label: 'سکرت webhook', value: services.telegram.webhookSecretSet ? 'تنظیم شده' : 'ندارد' },
            { label: 'آدرس عمومی', value: services.telegram.publicUrl || 'حدس از هدر درخواست' },
          ]}
          onProbe={async () => {
            const probe = await adminApi.probeTelegram();
            return {
              tone: probe.ok ? 'ok' : 'bad',
              lines: [
                { label: 'بات', value: probe.bot ? `@${probe.bot.username ?? probe.bot.id}` : '—' },
                { label: 'webhook', value: probe.webhook?.url || 'ثبت نشده' },
                { label: 'در صف', value: String(probe.webhook?.pending ?? 0) },
              ],
              error: probe.error ?? probe.webhook?.lastError ?? undefined,
            };
          }}
          footer={<Link className="btn btn-ghost btn-sm" href="/admin/telegram">تنظیمات ربات</Link>}
        />

        <ServiceCard
          title="دیتابیس"
          subtitle="PostgreSQL — منبع حقیقت قیمت و موجودی"
          icon={<IconStore size={15} />}
          status={services.database ? `${services.database.latencyMs}ms` : 'DOWN'}
          statusTone={services.database ? 'on' : 'off'}
          meta={[
            { label: 'نسخه', value: services.database?.version ?? '—' },
            { label: 'حجم', value: services.database?.size ?? '—' },
            { label: 'جدول‌ها', value: faNum(services.database?.tables ?? 0) },
            { label: 'آخرین مهاجرت', value: services.database?.migrations[0]?.name ?? '—' },
          ]}
          onProbe={async () => {
            const probe = await adminApi.probeDatabase();
            return probe.ok
              ? {
                  tone: 'ok',
                  lines: [
                    { label: 'زمان اتصال', value: `${probe.latencyMs}ms` },
                    { label: 'نسخه', value: probe.version },
                    { label: 'محصولات', value: faNum(probe.products) },
                  ],
                }
              : { tone: 'bad', lines: [{ label: 'زمان', value: `${probe.latencyMs}ms` }], error: probe.error };
          }}
          footer={<Link className="btn btn-ghost btn-sm" href="/admin/database">تنظیمات اتصال</Link>}
        />

        <ServiceCard
          title="پرداخت"
          subtitle={services.payment.provider === 'zarinpal' ? 'درگاه زرین‌پال فعال' : 'حالت آزمایشی (بدون جابه‌جایی پول)'}
          icon={<IconWallet size={15} />}
          status={services.payment.provider === 'zarinpal' ? 'LIVE' : 'SANDBOX'}
          statusTone={services.payment.provider === 'zarinpal' ? 'on' : 'warn'}
          meta={[
            { label: 'ارائه‌دهنده', value: services.payment.provider },
            { label: 'کش', value: services.cache.enabled ? 'فعال' : 'خاموش' },
            { label: 'محیط', value: runtime.env },
          ]}
          footer={<Link className="btn btn-ghost btn-sm" href="/admin/payments">تنظیمات پرداخت</Link>}
        />
      </div>

      <div className="grid g-2" style={{ gap: 14 }}>
        <section className="card" style={{ overflow: 'hidden' }}>
          <div className="card-head">
            <div>
              <div className="card-title">آخرین فروشگاه‌ها</div>
              <div className="card-desc">شش فروشگاه تازه‌ساخته‌شده</div>
            </div>
            <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={load} disabled={busy} aria-label="بازخوانی">
              {busy ? <Spinner size={14} /> : <IconRefresh size={14} />}
            </button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="adm-table">
              <thead>
                <tr>
                  <th>فروشگاه</th>
                  <th className="hide-sm">مالک</th>
                  <th>محصول</th>
                  <th>سفارش</th>
                  <th>ربات</th>
                </tr>
              </thead>
              <tbody>
                {data.recentShops.length === 0 && (
                  <tr><td colSpan={5} className="muted small">هنوز فروشگاهی ثبت نشده است.</td></tr>
                )}
                {data.recentShops.map(shop => (
                  <tr key={shop.id}>
                    <td>
                      <div style={{ fontWeight: 700 }}>{shop.name}</div>
                      <div className="small muted">{ago(shop.createdAt)}</div>
                    </td>
                    <td className="mono hide-sm">{shop.owner}</td>
                    <td className="num">{faNum(shop.products)}</td>
                    <td className="num">{faNum(shop.orders)}</td>
                    <td>
                      {shop.bot
                        ? <span className="adm-pipe on" style={{ padding: '2px 8px' }}><i />{shop.ownerLinked ? 'متصل' : 'بدون مالک'}</span>
                        : <span className="adm-pipe" style={{ padding: '2px 8px' }}><i />—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card" style={{ overflow: 'hidden' }}>
          <div className="card-head">
            <div>
              <div className="card-title">دفتر گردش</div>
              <div className="card-desc">۱۲ رویداد آخر — خواندن، نوشتن، خطا و تغییر تنظیمات</div>
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="adm-table">
              <thead>
                <tr>
                  <th>اکشن</th>
                  <th className="hide-sm">مسیر</th>
                  <th>کد</th>
                  <th>زمان</th>
                </tr>
              </thead>
              <tbody>
                {data.recentAudit.map(row => (
                  <tr key={row.id}>
                    <td className="act">{row.action}</td>
                    <td className="mono hide-sm">{row.path}</td>
                    <td>
                      <span className={`dotst${row.success ? '' : ' bad'}`}><i />{row.statusCode}</span>
                    </td>
                    <td className="small muted">{ago(row.at)}</td>
                  </tr>
                ))}
                {data.recentAudit.length === 0 && (
                  <tr><td colSpan={4} className="muted small">رویدادی ثبت نشده است.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <div className="adm-note">
        <IconInfo size={16} />
        <span>
          پنل ادمین تنظیمات سطح پلتفرم را نگه می‌دارد، نه داده‌ی یک فروشگاه. برای دیدن پنل یک فروشنده از
          {' '}<Link className="notif-link" href="/app">پنل فروشنده</Link> استفاده کنید؛ حساب ادمین به‌طور عمدی فروشگاه ندارد.
        </span>
      </div>
    </>
  );
}
