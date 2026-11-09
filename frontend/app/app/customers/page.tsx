'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api, ApiError, type CustomerRow, type Customers } from '@/lib/api';
import { faDate, faNum, relativeTime, toman } from '@/lib/format';
import { useRealtime } from '@/lib/realtime';
import { EmptyState, PageHeader, Segmented, SkeletonBlock, useToast } from '@/components/ui';
import { IconChat, IconSearch, IconUsers } from '@/components/icons';

type Filter = 'all' | 'buyers' | 'repeat' | 'quiet';
type Sort = 'value' | 'recent' | 'orders';

const SORTS: { value: Sort; label: string }[] = [
  { value: 'value', label: 'بیشترین خرید' },
  { value: 'recent', label: 'آخرین فعالیت' },
  { value: 'orders', label: 'تعداد سفارش' },
];

/**
 * مشتریان — فهرستی از آدم‌ها، نه از سفارش‌ها.
 *
 * تفاوت مهم با صفحه‌ی سفارش‌ها: کسی که فقط سؤال پرسیده و نخریده هم اینجاست.
 * برای فروشنده‌ی کوچک همین فهرست، لیست گرم تماس است؛ پس «خریدار / تکراری /
 * ساکت» را جدا کردیم تا بشود روی هر گروه پیام گذاشت.
 */
export default function CustomersPage() {
  const toast = useToast();
  const [data, setData] = useState<Customers | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('value');

  const load = useCallback(async () => {
    try {
      setData(await api.customers());
    } catch (problem) {
      toast.error('فهرست مشتریان بارگذاری نشد', problem instanceof ApiError ? problem.message : undefined);
    } finally {
      setLoading(false);
    }
  }, [toast]);

    // رخداد زنده: هر تغییر سمت سرور (سفارش، پیام، موجودی، محصول) همین‌جا
  // بدون رفرش بازخوانی می‌شود. فعل و انفعال پنل با خودش هم بی‌ضرر است.
  useRealtime(['chat', 'order'], () => { void load(); });

useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    const rows = (data?.items ?? []).filter(row => {
      if (filter === 'buyers' && !row.segments.buyer) return false;
      if (filter === 'repeat' && !row.segments.repeat) return false;
      if (filter === 'quiet' && !row.segments.quiet) return false;
      if (!term) return true;
      return row.name.toLowerCase().includes(term) || (row.username ?? '').toLowerCase().includes(term);
    });
    return [...rows].sort((a, b) => {
      if (sort === 'value') return b.value - a.value;
      if (sort === 'orders') return b.orders - a.orders;
      return a.lastActivityAt < b.lastActivityAt ? 1 : -1;
    });
  }, [data, query, filter, sort]);

  const counts = data?.counts ?? { all: 0, buyers: 0, repeat: 0, value: 0 };

  return (
    <div className="stack">
      <PageHeader
        eyebrow="مخاطبان"
        title="مشتریان"
        description={`${faNum(counts.all)} مخاطب · ${faNum(counts.buyers)} خریدار · ${faNum(counts.repeat)} خرید تکراری · ${toman(counts.value)} ارزش خرید`}
        actions={<Link href="/app/conversations" className="btn btn-outline">گفت‌وگوها</Link>}
      />

      <div className="card card-pad filters-bar">
        <div className="input-wrap" style={{ flex: '1 1 240px' }}>
          <IconSearch className="input-ico" size={15} />
          <input
            className="input input-sm" placeholder="جستجوی نام یا نام کاربری…"
            value={query} onChange={event => setQuery(event.target.value)} aria-label="جستجوی مشتری"
          />
        </div>
        <Segmented<Filter>
          value={filter}
          onChange={setFilter}
          ariaLabel="بخش‌بندی مشتریان"
          options={[
            { value: 'all', label: 'همه' },
            { value: 'buyers', label: 'خریدار' },
            { value: 'repeat', label: 'تکراری' },
            { value: 'quiet', label: 'ساکت' },
          ]}
        />
        <span className="small muted" style={{ marginInlineStart: 'auto' }}>ترتیب:</span>
        <div className="chip-tabs" role="group" aria-label="ترتیب">
          {SORTS.map(item => (
            <button
              key={item.value} type="button"
              className={`chip-btn ${sort === item.value ? 'on' : ''}`}
              onClick={() => setSort(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="stack">{[0, 1, 2].map(index => <SkeletonBlock key={index} height={76} />)}</div>
      ) : visible.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<IconUsers />}
            title={(data?.items.length ?? 0) === 0 ? 'هنوز مشتری‌ای ندارید' : 'کسی با این فیلتر پیدا نشد'}
            description={(data?.items.length ?? 0) === 0
              ? 'اولین پیام در تلگرام، اولین مشتری را می‌سازد — حتی اگر خریدی انجام نشود.'
              : 'فیلتر یا عبارت جستجو را تغییر دهید.'}
          />
        </div>
      ) : (
        <div className="card rows-card">
          <div className="cust-head">
            <span>مشتری</span>
            <span className="hide-sm">پیام</span>
            <span>سفارش</span>
            <span>ارزش خرید</span>
            <span className="hide-sm">آخرین فعالیت</span>
            <span />
          </div>
          {visible.map(row => (
            <CustomerLine key={row.chatId} row={row} />
          ))}
        </div>
      )}
    </div>
  );
}

function CustomerLine({ row }: { row: CustomerRow }) {
  return (
    <div className="cust-row">
      <div className="cust-cell cust-id">
        <span className="avatar avatar-brand conv-av">{row.name.replace(/^@/, '').slice(0, 2).toUpperCase()}</span>
        <span className="cust-id-main">
          <strong>{row.name}</strong>
          <span className="small muted">
            {row.username ? `@${row.username}` : 'بدون نام کاربری'}
            {row.firstSeenAt && ` · از ${faDate(row.firstSeenAt)}`}
          </span>
        </span>
      </div>
      <div className="cust-cell hide-sm"><span className="num">{faNum(row.messageCount)}</span></div>
      <div className="cust-cell">
        <span className="num strong">{faNum(row.orders)}</span>
        {row.segments.repeat && <span className="badge b-green">تکراری</span>}
        {!row.segments.buyer && <span className="badge b-gray">فقط پرسیده</span>}
      </div>
      <div className="cust-cell"><span className="num">{row.value > 0 ? toman(row.value) : '—'}</span></div>
      <div className="cust-cell hide-sm">
        <span className="small muted">{relativeTime(row.lastActivityAt)}</span>
        {row.segments.quiet && <span className="badge b-amber">ساکت</span>}
      </div>
      <div className="cust-cell cust-actions">
        <Link href={`/app/conversations?chat=${encodeURIComponent(row.chatId)}`} className="btn btn-soft btn-sm">
          <IconChat size={14} />گفتگو
        </Link>
      </div>
    </div>
  );
}
