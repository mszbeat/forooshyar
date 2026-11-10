'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { api, ApiError, type AttentionItem, type Summary } from '@/lib/api';
import { faDate, faNum, faWeekday, relativeTime, toman, tomanShort, variantLabel } from '@/lib/format';
import { useRealtime } from '@/lib/realtime';
import { EmptyState, SkeletonBlock, SkeletonRows, StatCard, useToast } from '@/components/ui';
import { SalesChart } from '@/components/sales-chart';
import { InventoryDonut } from '@/components/inventory-donut';
import {
  IconAlert, IconArrowLeft, IconBolt, IconBox, IconCheckCircle, IconClock,
  IconMoney, IconPackage, IconPlus, IconSparkles, IconTrendUp, IconUpload, IconWallet,
} from '@/components/icons';

const REASONS: Record<string, string> = {
  sale: 'فروش', restock: 'شارژ موجودی', manual: 'اصلاح دستی', initial: 'موجودی اولیه',
};

export default function DashboardPage() {
  const { shop } = useAuth();
  const toast = useToast();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [attention, setAttention] = useState<AttentionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tested, setTested] = useState(false);
  const [chartMetric, setChartMetric] = useState<'revenue' | 'units'>('revenue');

  const load = useCallback(async () => {
    try {
      const [data, items] = await Promise.all([api.summary(), api.attention()]);
      setSummary(data);
      setAttention(items);
      setError('');
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.message : 'بارگذاری اطلاعات انجام نشد.');
    } finally {
      setLoading(false);
    }
  }, []);

    // رخداد زنده: هر تغییر سمت سرور (سفارش، پیام، موجودی، محصول) همین‌جا
  // بدون رفرش بازخوانی می‌شود. فعل و انفعال پنل با خودش هم بی‌ضرر است.
  useRealtime(['order', 'chat', 'stock', 'product'], () => { void load(); });

useEffect(() => { void load(); }, [load]);
  useEffect(() => { setTested(window.localStorage.getItem('forooshyar.botTested') === '1'); }, []);

  const checklist = useMemo(() => {
    const steps = [
      { label: 'ساخت فروشگاه', done: Boolean(shop?.name), href: '/app/settings' },
      { label: 'تکمیل تنظیمات پاسخ (ارسال، پرداخت، ساعت کاری)', done: Boolean(shop?.shipping && shop?.payment), href: '/app/settings' },
      { label: 'افزودن اولین محصول', done: (summary?.products.total ?? 0) > 0, href: '/app/products' },
      { label: 'ثبت موجودی واریانت‌ها', done: (summary?.inventory.totalStock ?? 0) > 0, href: '/app/products' },
      { label: 'تست پاسخ دستیار', done: tested, href: '/app/assistant' },
    ];
    const done = steps.filter(step => step.done).length;
    return { steps, done, total: steps.length, percent: Math.round((done / steps.length) * 100) };
  }, [shop, summary, tested]);

  if (loading) {
    return (
      <div className="stack">
        <div className="grid g-4">
          {[0, 1, 2, 3].map(index => <SkeletonBlock key={index} height={124} />)}
        </div>
        <div className="split-even">
          <SkeletonBlock height={280} />
          <SkeletonBlock height={280} />
        </div>
        <div className="card"><SkeletonRows rows={4} /></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="alert alert-error">
        <IconAlert />
        <div>
          <strong>بارگذاری داشبورد انجام نشد</strong>
          <div className="small">{error}</div>
        </div>
      </div>
    );
  }

  const sales = summary!.sales;
  const chartTotal = chartMetric === 'revenue' ? sales.week.revenue : sales.week.units;
  const empty = summary!.products.total === 0;

  return (
    <div className="stack">
      <div className="dash-hero">
        <div>
          <span className="dash-overline">داشبورد فروشگاه</span>
        </div>
        <h1 className="dash-greet">
          <span className="dash-greet-hi">خوش آمدید</span>
          <span className="dash-greet-name">
            {shop?.name ?? 'فروشگاه شما'}
            <span className="swash" aria-hidden="true">{(shop?.name ?? 'ف').trim().charAt(0)}</span>
          </span>
        </h1>
        <div className="dash-meta">
          <span>{faWeekday(new Date())}</span>
          <span className="sep" aria-hidden="true" />
          <span>{faDate(new Date())}</span>
          <span className="sep" aria-hidden="true" />
          <span>این خلاصهٔ امروز فروشگاه شماست.</span>
        </div>
        <div className="dash-actions">
          <Link href="/app/import" className="btn btn-outline">
            <IconUpload size={16} />
            ورود کاتالوگ
          </Link>
          <Link href="/app/products?new=1" className="btn btn-primary">
            <IconPlus size={16} />
            محصول جدید
          </Link>
        </div>
      </div>

      {empty && (
        <div className="card card-pad">
          <div className="row-between" style={{ alignItems: 'center' }}>
            <div className="row" style={{ gap: 14 }}>
              <span className="stat-ico" style={{ width: 38, height: 38 }}><IconSparkles size={18} /></span>
              <div>
                <div className="strong">کاتالوگ شما هنوز خالی است</div>
                <div className="small muted">با افزودن اولین محصول، دستیار پاسخ‌گو می‌تواند قیمت و موجودی را از کاتالوگ بخواند.</div>
              </div>
            </div>
            <Link href="/app/products?new=1" className="btn btn-primary">
              <IconPlus size={16} />
              افزودن اولین محصول
            </Link>
          </div>
        </div>
      )}

      <div className="stat-strip">
        <StatCard
          icon={<IconMoney />}
          label="فروش امروز"
          value={tomanShort(sales.today.revenue)}
          unit="تومان"
          foot={<> <IconPackage size={13} /> {faNum(sales.today.units)} قلم فروخته شده</>}
        />
        <StatCard
          icon={<IconTrendUp />}
          label="فروش ۷ روز گذشته"
          value={tomanShort(sales.week.revenue)}
          unit="تومان"
          foot={<><IconBolt size={13} /> {faNum(sales.week.units)} قلم در {faNum(7)} روز</>}
        />
        <StatCard
          icon={<IconWallet />}
          label="ارزش انبار"
          value={tomanShort(summary!.inventory.value)}
          unit="تومان"
          foot={<><IconBox size={13} /> {faNum(summary!.inventory.totalStock)} عدد موجودی</>}
        />
        <StatCard
          icon={<IconAlert />}
          label="نیازمند رسیدگی"
          value={faNum(summary!.variants.outOfStock + summary!.variants.lowStock)}
          unit="واریانت"
          tone={summary!.variants.outOfStock > 0 ? 'amber' : 'brand'}
          foot={<>{faNum(summary!.variants.outOfStock)} ناموجود · {faNum(summary!.variants.lowStock)} کم‌موجود</>}
        />
      </div>

      <div className="split">
        <section className="card">
          <div className="card-head">
            <div>
              <div className="card-title">روند فروش هفت روز</div>
              <div className="card-desc">بر اساس دفتر گردش موجودی، فقط تراکنش‌های فروش</div>
            </div>
            <div className="chart-switch" role="group" aria-label="نوع نمودار">
              <button type="button" aria-pressed={chartMetric === 'revenue'} className={chartMetric === 'revenue' ? 'on' : ''} onClick={() => setChartMetric('revenue')}>درآمد</button>
              <button type="button" aria-pressed={chartMetric === 'units'} className={chartMetric === 'units' ? 'on' : ''} onClick={() => setChartMetric('units')}>تعداد</button>
            </div>
          </div>
          <div className="card-body">
            {chartTotal === 0 ? (
              <EmptyState
                icon={<IconTrendUp />}
                title="در این هفته فروشی ثبت نشده"
                description="با ثبت اولین فروش، نمودار درآمد و تعداد اقلام اینجا به‌روز می‌شود."
                action={<Link href="/app/products" className="btn btn-soft">رفتن به محصولات</Link>}
              />
            ) : <SalesChart series={sales.series} metric={chartMetric} />}
          </div>
          <div className="card-foot row-between">
            <span className="small muted">مجموع هفته: <strong className="strong" style={{ color: 'var(--ink)' }}>{toman(sales.week.revenue)}</strong></span>
            <Link href="/app/products" className="small" style={{ color: 'var(--brand)', fontWeight: 500 }}>مدیریت موجودی ←</Link>
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <div>
              <div className="card-title">راه‌اندازی فروشگاه</div>
              <div className="card-desc">{faNum(checklist.done)} از {faNum(checklist.total)} قدم کامل شده</div>
            </div>
            <span className="badge b-gray num">{faNum(checklist.percent)}٪</span>
          </div>
          <div className="card-body" style={{ paddingBottom: 12 }}>
            <div className="progress"><span style={{ width: `${checklist.percent}%` }} /></div>
            <InventoryDonut total={summary!.variants.total} low={summary!.variants.lowStock} out={summary!.variants.outOfStock} />
            <ul className="mt-4" style={{ display: 'grid', gap: 10 }}>
              {checklist.steps.map(step => (
                <li key={step.label}>
                  <Link href={step.href} className="row setup-step" style={{ gap: 9, color: step.done ? 'var(--ink-3)' : 'var(--ink)' }}>
                    <span
                      style={{
                        width: 20, height: 20, borderRadius: 7, display: 'grid', placeItems: 'center', flex: '0 0 auto',
                        border: `1.5px solid ${step.done ? 'var(--brand)' : 'var(--line-strong)'}`,
                        background: step.done ? 'var(--brand)' : 'transparent',
                        color: '#fff',
                      }}
                    >
                      {step.done && <IconCheckCircle size={13} />}
                    </span>
                    <span style={{ fontSize: 'var(--fs-sm)', textDecoration: step.done ? 'line-through' : 'none', textDecorationColor: 'var(--line-strong)' }}>
                      {step.label}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>

      <div className="split-even">
        <section className="card">
          <div className="card-head">
            <div>
              <div className="card-title">نیازمند رسیدگی</div>
              <div className="card-desc">ناموجود، کم‌موجود یا موجودی قدیمی</div>
            </div>
            <Link href="/app/products?filter=attention" className="btn btn-ghost btn-sm">همه</Link>
          </div>
          {attention.length === 0 ? (
            <EmptyState icon={<IconCheckCircle />} title="همه‌چیز مرتب است" description="واریانتی با موجودی کم یا ناموجود پیدا نشد." />
          ) : (
            <div className="list">
              {attention.slice(0, 6).map(item => (
                <div className="list-row" key={item.id}>
                  <span className="avatar" style={{
                    background: item.severity === 'out' ? 'var(--danger-soft)' : 'var(--amber-soft)',
                    color: item.severity === 'out' ? 'var(--danger)' : 'var(--amber)',
                    borderColor: item.severity === 'out' ? 'var(--danger-line)' : 'var(--amber-line)',
                  }}>
                    <IconPackage size={16} />
                  </span>
                  <div className="list-main">
                    <div className="list-title">{item.product.title}</div>
                    <div className="list-sub">{variantLabel(item)} · {toman(item.price)}</div>
                  </div>
                  <span className={`badge ${item.severity === 'out' ? 'b-red' : item.severity === 'low' ? 'b-amber' : 'b-gray'}`}>
                    {item.severity === 'out' ? 'ناموجود' : item.severity === 'low' ? `موجودی ${faNum(item.stock)}` : `به‌روزرسانی ${relativeTime(item.stockUpdatedAt)}`}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="card">
          <div className="card-head">
            <div>
              <div className="card-title">آخرین تغییرات موجودی</div>
              <div className="card-desc">دفتر گردش، جدیدترین تراکنش‌ها</div>
            </div>
          </div>
          {summary!.recent.length === 0 ? (
            <EmptyState icon={<IconClock />} title="هنوز تراکنشی ثبت نشده" description="فروش یا شارژ موجودی انجام دهید تا اینجا نمایش داده شود." />
          ) : (
            <div className="list">
              {summary!.recent.slice(0, 6).map(movement => (
                <div className="list-row" key={movement.id}>
                  <span className="avatar" style={{
                    background: movement.delta < 0 ? 'var(--danger-soft)' : 'var(--ok-soft)',
                    color: movement.delta < 0 ? 'var(--danger)' : 'var(--ok)',
                    borderColor: movement.delta < 0 ? 'var(--danger-line)' : '#cbe9db',
                  }}>
                    {movement.delta < 0 ? '−' : '+'}
                  </span>
                  <div className="list-main">
                    <div className="list-title">{movement.variant.product.title}</div>
                    <div className="list-sub">{variantLabel(movement.variant)} · {REASONS[movement.reason] ?? movement.reason}</div>
                  </div>
                  <div style={{ textAlign: 'left' }}>
                    <div className="num strong" style={{ color: movement.delta < 0 ? 'var(--danger)' : 'var(--ok)' }}>
                      {movement.delta < 0 ? '−' : '+'}{faNum(Math.abs(movement.delta))}
                    </div>
                    <div className="small muted">{relativeTime(movement.createdAt)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="dark-band">
        <div className="row-between">
          <div>
            <div className="row" style={{ gap: 10 }}>
              <IconSparkles size={19} />
              <strong className="dark-title">پاسخ دستیار را قبل از انتشار ببینید</strong>
            </div>
            <p className="dark-desc">
              گفتگوی آزمایشی، همان منطق واقعی پاسخ‌گویی را اجرا می‌کند — بدون ارسال پیام و بدون تغییر داده.
            </p>
          </div>
          <Link href="/app/assistant" className="btn btn-lg btn-on-dark">
            شروع تست
            <IconArrowLeft size={17} />
          </Link>
        </div>
      </section>
    </div>
  );
}
