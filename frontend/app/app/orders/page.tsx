'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api, ApiError, type Order, type OrderStatus, type OrdersSummary } from '@/lib/api';
import { faDateTime, faNum, relativeTime, toman } from '@/lib/format';
import { EmptyState, Modal, PageHeader, Segmented, SkeletonBlock, Spinner, StatCard, useToast } from '@/components/ui';
import {
  IconAlertCircle, IconArrowLeft, IconBox, IconCheckCircle, IconClock, IconDownload,
  IconMoney, IconPackage, IconRefresh, IconSend, IconWallet,
} from '@/components/icons';

type Filter = 'all' | OrderStatus;

/**
 * سفارش‌هایی که از تلگرام می‌آیند.
 *
 * هر سفارش دقیقاً یک مسیر دارد و پنل همان را نشان می‌دهد:
 *   در انتظار پرداخت → پرداخت‌شده → ارسال‌شده → تحویل‌شده
 * و از هر مرحله‌ای (به‌جز تحویل) لغو ممکن است. دکمه‌ها فقط برای گذارهای مجاز
 * نمایش داده می‌شوند تا فروشنده با دکمه‌ای که کار نمی‌کند روبه‌رو نشود.
 */

const STATUS: Record<OrderStatus, { label: string; tone: string }> = {
  AWAITING_PAYMENT: { label: 'در انتظار پرداخت', tone: 'b-amber' },
  PAID: { label: 'پرداخت‌شده', tone: 'b-brand' },
  SHIPPED: { label: 'ارسال‌شده', tone: 'b-blue' },
  COMPLETED: { label: 'تحویل‌شده', tone: 'b-green' },
  CANCELLED: { label: 'لغوشده', tone: 'b-red' },
};

const NEXT: Partial<Record<OrderStatus, { to: OrderStatus; label: string; icon: 'send' | 'check' }[]>> = {
  PAID: [
    { to: 'SHIPPED', label: 'ارسال شد', icon: 'send' },
    { to: 'CANCELLED', label: 'لغو سفارش', icon: 'check' },
  ],
  SHIPPED: [
    { to: 'COMPLETED', label: 'تحویل شد', icon: 'check' },
    { to: 'CANCELLED', label: 'لغو سفارش', icon: 'check' },
  ],
};

export default function OrdersPage() {
  const toast = useToast();
  const [orders, setOrders] = useState<Order[]>([]);
  const [summary, setSummary] = useState<OrdersSummary | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [open, setOpen] = useState<Order | null>(null);

  const load = useCallback(async () => {
    try {
      const [list, stats] = await Promise.all([api.orders(), api.ordersSummary()]);
      setOrders(list);
      setSummary(stats);
    } catch (problem) {
      toast.error('بارگذاری سفارش‌ها انجام نشد', problem instanceof ApiError ? problem.message : undefined);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(
    () => (filter === 'all' ? orders : orders.filter(order => order.status === filter)),
    [orders, filter],
  );

  const counts = useMemo(() => {
    const base: Record<Filter, number> = {
      all: orders.length, AWAITING_PAYMENT: 0, PAID: 0, SHIPPED: 0, COMPLETED: 0, CANCELLED: 0,
    };
    for (const order of orders) base[order.status] += 1;
    return base;
  }, [orders]);

  async function changeStatus(order: Order, status: OrderStatus) {
    setBusyId(order.id);
    try {
      const updated = await api.setOrderStatus(order.id, status);
      setOrders(current => current.map(item => (item.id === updated.id ? { ...item, ...updated } : item)));
      setOpen(current => (current && current.id === updated.id ? { ...current, ...updated } : current));
      toast.success('وضعیت سفارش به‌روز شد', `${updated.code} → ${STATUS[updated.status].label}`);
      void load();
    } catch (problem) {
      toast.error('تغییر وضعیت انجام نشد', problem instanceof ApiError ? problem.message : undefined);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="فروش"
        title="سفارش‌ها"
        description="سفارش‌هایی که مشتری‌ها از تلگرام ثبت و پرداخت کرده‌اند. وضعیت را با یک کلیک جلو ببرید؛ مشتری خبر می‌گیرد."
        actions={
          <button className="btn btn-ghost btn-sm" onClick={() => void load()} disabled={loading}>
            <IconRefresh size={14} />
            به‌روزرسانی
          </button>
        }
      />

      <div className="card mt-4">
        <div className="grid g-4">
          <StatCard
            icon={<IconClock size={15} />}
            label="در انتظار پرداخت"
            value={faNum(summary?.awaitingPayment ?? 0)}
            unit="سفارش"
            tone={(summary?.awaitingPayment ?? 0) > 0 ? 'amber' : undefined}
            foot={<span className="small muted">پرداخت‌نشده‌ها بعد از ۲۴ ساعت خودکار لغو می‌شوند</span>}
          />
          <StatCard
            icon={<IconWallet size={15} />}
            label="فروش ۲۴ ساعت گذشته"
            value={toman(summary?.revenueLast24h ?? 0)}
            foot={<span className="small muted">{faNum(summary?.paidLast24h ?? 0)} سفارش پرداخت‌شده</span>}
          />
          <StatCard
            icon={<IconPackage size={15} />}
            label="آماده‌ی ارسال"
            value={faNum(counts.PAID)}
            unit="سفارش"
            foot={<span className="small muted">پرداخت شده، هنوز ارسال نشده</span>}
          />
          <StatCard
            icon={<IconCheckCircle size={15} />}
            label="تحویل‌شده"
            value={faNum(counts.COMPLETED)}
            unit="سفارش"
            foot={<span className="small muted">از ابتدا تا امروز</span>}
          />
        </div>
      </div>

      <div className="row-between mt-4" style={{ gap: 10, flexWrap: 'wrap' }}>
        <Segmented<Filter>
          ariaLabel="فیلتر وضعیت سفارش"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: `همه (${faNum(counts.all)})` },
            { value: 'AWAITING_PAYMENT', label: `در انتظار پرداخت (${faNum(counts.AWAITING_PAYMENT)})` },
            { value: 'PAID', label: `آماده ارسال (${faNum(counts.PAID)})` },
            { value: 'SHIPPED', label: `ارسال‌شده (${faNum(counts.SHIPPED)})` },
            { value: 'COMPLETED', label: `تحویل‌شده (${faNum(counts.COMPLETED)})` },
          ]}
        />
      </div>

      <div className="mt-4">
        {loading ? (
          <div className="stack">{[0, 1, 2].map(index => <SkeletonBlock key={index} height={96} />)}</div>
        ) : visible.length === 0 ? (
          <div className="card">
            <EmptyState
              icon={<IconBox />}
              title={orders.length === 0 ? 'هنوز سفارشی ثبت نشده' : 'سفارشی با این فیلتر نیست'}
              description={orders.length === 0
                ? 'مشتری‌ها با لینک فروشگاه در تلگرام سفارش می‌دهند. لینک را از تنظیمات → اتصال به تلگرام بردارید و در بیو اینستاگرام بگذارید.'
                : 'فیلتر دیگری را امتحان کنید.'}
              action={orders.length === 0
                ? <Link href="/app/settings" className="btn btn-primary"><IconSend size={16} />گرفتن لینک فروشگاه</Link>
                : undefined}
            />
          </div>
        ) : (
          <div className="card rows-card">
            {visible.map(order => {
              const status = STATUS[order.status];
              const busy = busyId === order.id;
              return (
                <article className="row-item" key={order.id}>
                  <div className="row-item-in">
                    <span className="avatar avatar-brand" style={{ width: 34, height: 34 }}>
                      <IconMoney size={16} />
                    </span>

                    <div style={{ minWidth: 0, flex: '1 1 240px' }}>
                      <div className="row" style={{ gap: 8 }}>
                        <strong style={{ fontSize: 'var(--fs-md)', fontWeight: 500 }} className="mono">{order.code}</strong>
                        <span className={`badge ${status.tone}`}><span className="dot" />{status.label}</span>
                      </div>
                      <div className="small muted">
                        {order.customerName || 'بدون نام'} · {faDateTime(order.createdAt)}
                      </div>
                    </div>

                    <div style={{ minWidth: 0, flex: '1 1 180px' }}>
                      <div className="small" style={{ lineHeight: 1.9 }}>
                        {(order.items ?? []).slice(0, 2).map(item => (
                          <div key={item.id} className="truncate">
                            {item.title}{item.spec ? ` · ${item.spec}` : ''} × {faNum(item.quantity)}
                          </div>
                        ))}
                        {(order.items ?? []).length > 2 && <div className="muted">+{faNum(order.items.length - 2)} قلم دیگر</div>}
                      </div>
                    </div>

                    <div style={{ textAlign: 'center', minWidth: 110 }}>
                      <div className="num" style={{ fontWeight: 300, fontSize: 18 }}>{faNum(order.total)}</div>
                      <div className="small muted">تومان</div>
                    </div>

                    <div className="row" style={{ gap: 6 }}>
                      <button className="btn btn-outline btn-sm" onClick={() => setOpen(order)}>
                        جزئیات
                      </button>
                      {(NEXT[order.status] ?? []).slice(0, 1).map(action => (
                        <button
                          key={action.to}
                          className={`btn btn-sm ${action.to === 'CANCELLED' ? 'btn-soft' : 'btn-primary'}`}
                          disabled={busy}
                          onClick={() => void changeStatus(order, action.to)}
                        >
                          {busy ? <Spinner size={13} /> : action.icon === 'send' ? <IconSend size={13} /> : <IconCheckCircle size={13} />}
                          {action.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      <Modal open={Boolean(open)} onClose={() => setOpen(null)} title={open ? `سفارش ${open.code}` : ''}>
        {open && (
          <div className="stack" style={{ gap: 16 }}>
            <div className="row-between">
              <span className={`badge ${STATUS[open.status].tone}`}><span className="dot" />{STATUS[open.status].label}</span>
              <span className="small muted">{faDateTime(open.createdAt)}</span>
            </div>

            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr><th>قلم</th><th>تعداد</th><th>قیمت</th></tr>
                </thead>
                <tbody>
                  {open.items.map(item => (
                    <tr key={item.id}>
                      <td>{item.title}{item.spec ? <span className="muted"> · {item.spec}</span> : ''}</td>
                      <td className="td-num">{faNum(item.quantity)}</td>
                      <td className="td-num nowrap">{toman(item.price * item.quantity)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="row-between" style={{ borderTop: '1px solid var(--line)', paddingTop: 12 }}>
              <span className="strong">مبلغ کل</span>
              <span className="strong num">{toman(open.total)}</span>
            </div>

            <div className="card" style={{ background: 'var(--surface-2, #fafafa)' }}>
              <div className="card-body stack" style={{ gap: 8 }}>
                <div><span className="kv-k">گیرنده: </span>{open.customerName || '—'}</div>
                <div>
                  <span className="kv-k">موبایل: </span>
                  <a className="mono" href={`tel:${open.customerPhone}`} dir="ltr">{open.customerPhone || '—'}</a>
                </div>
                <div><span className="kv-k">نشانی: </span>{open.address || '—'}</div>
                {open.note && <div><span className="kv-k">یادداشت: </span>{open.note}</div>}
                {open.paymentRefId && <div className="small muted">کد پیگیری پرداخت: <span className="mono">{open.paymentRefId}</span> · {open.paymentProvider}</div>}
                {open.status === 'CANCELLED' && open.cancelledReason && (
                  <div className="small muted">دلیل لغو: {open.cancelledReason === 'expired' ? 'پرداخت انجام نشد (خودکار)' : 'توسط فروشنده'}</div>
                )}
              </div>
            </div>

            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              {(NEXT[open.status] ?? []).map(action => (
                <button
                  key={action.to}
                  className={`btn ${action.to === 'CANCELLED' ? 'btn-soft' : 'btn-primary'}`}
                  disabled={busyId === open.id}
                  onClick={() => void changeStatus(open, action.to)}
                >
                  {busyId === open.id ? <Spinner size={14} /> : action.icon === 'send' ? <IconSend size={14} /> : <IconCheckCircle size={14} />}
                  {action.label}
                </button>
              ))}
              {open.status === 'AWAITING_PAYMENT' && (
                <span className="small muted">
                  <IconAlertCircle size={13} /> منتظر پرداخت مشتری. تا ۲۴ ساعت دیگر خودکار لغو می‌شود.
                </span>
              )}
              <Link href="/app/assistant" className="btn btn-ghost">
                <IconArrowLeft size={14} />
                دستیار
              </Link>
              <button className="btn btn-ghost" onClick={() => download(open)}>
                <IconDownload size={14} />
                فایل سفارش
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

/** خروجی متنی ساده برای پیگیری؛ بدون وابستگی به سرور. */
function download(order: Order) {
  const lines = [
    `سفارش ${order.code}`,
    `وضعیت: ${STATUS[order.status].label}`,
    `تاریخ: ${faDateTime(order.createdAt)}`,
    '',
    ...order.items.map(item => `${item.title}${item.spec ? ` (${item.spec})` : ''} × ${item.quantity} = ${item.price * item.quantity} تومان`),
    '',
    `مبلغ کل: ${order.total} تومان`,
    `گیرنده: ${order.customerName}`,
    `موبایل: ${order.customerPhone}`,
    `نشانی: ${order.address}`,
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${order.code}.txt`;
  anchor.click();
  URL.revokeObjectURL(url);
}
