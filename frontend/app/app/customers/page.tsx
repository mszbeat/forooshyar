'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api, type CustomerRow, type Order } from '@/lib/api';
import { faNum, relativeTime, toman } from '@/lib/format';
import { EmptyState, PageHeader, SkeletonBlock } from '@/components/ui';
import { IconChat, IconSearch, IconX } from '@/components/icons';

type Filter = 'all' | 'top' | 'repeat' | 'inactive';
type Sort = 'value' | 'orders' | 'recent';

/** آستانه‌های وفاداری — قابل تنظیم در آینده از تنظیمات فروشگاه. */
const LOYAL_ORDERS = 3;
const VIP_VALUE = 5_000_000;

function tagsFor(row: CustomerRow): string[] {
  const tags: string[] = [];
  if (row.segments.buyer) tags.push('خریدار');
  if (row.segments.repeat || row.orders >= LOYAL_ORDERS) tags.push('وفادار');
  if (row.value >= VIP_VALUE) tags.push('VIP');
  const days = (Date.now() - new Date(row.lastActivityAt).getTime()) / 86400000;
  if (days < 30 && row.orders === 0) tags.push('جدید');
  return tags;
}

export default function CustomersPage() {
  const [rows, setRows] = useState<CustomerRow[] | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('value');
  const [selected, setSelected] = useState<CustomerRow | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [customTags, setCustomTags] = useState<Record<string, string[]>>({});
  const [tagInput, setTagInput] = useState('');

  useEffect(() => {
    api.customers().then(data => setRows(data.items)).catch(() => setRows([]));
    api.orders().then(setOrders).catch(() => setOrders([]));
    try {
      const saved = window.localStorage.getItem('forooshyar.customerNotes');
      if (saved) setNotes(JSON.parse(saved));
      const savedTags = window.localStorage.getItem('forooshyar.customerTags');
      if (savedTags) setCustomTags(JSON.parse(savedTags));
    } catch { /* ignore */ }
  }, []);

  const ordersByChat = useMemo(() => {
    const map = new Map<string, Order[]>();
    for (const order of orders) {
      if (!order.chatId) continue;
      const list = map.get(order.chatId) ?? [];
      list.push(order);
      map.set(order.chatId, list);
    }
    return map;
  }, [orders]);

  const visible = useMemo(() => {
    let list = [...(rows ?? [])];
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter(r => r.name.toLowerCase().includes(q) || r.username.toLowerCase().includes(q));
    }
    if (filter === 'top') list = list.filter(r => r.value > 0).sort((a, b) => b.value - a.value).slice(0, 20);
    if (filter === 'repeat') list = list.filter(r => r.segments.repeat || r.orders >= 2);
    if (filter === 'inactive') {
      const cutoff = Date.now() - 90 * 86400000;
      list = list.filter(r => new Date(r.lastActivityAt).getTime() < cutoff);
    }
    if (sort === 'value') list.sort((a, b) => b.value - a.value);
    if (sort === 'orders') list.sort((a, b) => b.orders - a.orders);
    if (sort === 'recent') list.sort((a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime());
    return list;
  }, [rows, query, filter, sort]);

  const saveNotes = (chatId: string, value: string) => {
    const next = { ...notes, [chatId]: value };
    setNotes(next);
    try { window.localStorage.setItem('forooshyar.customerNotes', JSON.stringify(next)); } catch { /* ignore */ }
  };
  const addTag = (chatId: string) => {
    const tag = tagInput.trim();
    if (!tag) return;
    const next = { ...customTags, [chatId]: [...(customTags[chatId] ?? []), tag] };
    setCustomTags(next);
    setTagInput('');
    try { window.localStorage.setItem('forooshyar.customerTags', JSON.stringify(next)); } catch { /* ignore */ }
  };

  const selectedOrders = selected ? (ordersByChat.get(selected.chatId) ?? []) : [];

  return (
    <div className="stack">
      <PageHeader
        eyebrow="مشتریان"
        title="مشتریان فروشگاه"
        description="همه‌ی کسانی که در تلگرام یا اینستاگرام با شما گفتگو کرده‌اند؛ با سابقه‌ی خرید و برچسب‌های وفاداری."
      />

      <div className="card">
        <div className="card-body" style={{ display: 'grid', gap: 12 }}>
          <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
            <div className="input-wrap" style={{ flex: '1 1 220px' }}>
              <IconSearch className="input-ico" size={15} />
              <input className="input input-sm" placeholder="جستجو با نام یا نام کاربری…" value={query} onChange={e => setQuery(e.target.value)} aria-label="جستجوی مشتری" />
            </div>
            <select className="input input-sm" style={{ maxWidth: 180 }} value={filter} onChange={e => setFilter(e.target.value as Filter)} aria-label="فیلتر مشتریان">
              <option value="all">همه</option>
              <option value="top">پردرآمدترین‌ها</option>
              <option value="repeat">خرید تکراری</option>
              <option value="inactive">غیرفعال (۹۰ روز)</option>
            </select>
            <select className="input input-sm" style={{ maxWidth: 180 }} value={sort} onChange={e => setSort(e.target.value as Sort)} aria-label="مرتب‌سازی">
              <option value="value">بیشترین خرید</option>
              <option value="orders">بیشترین سفارش</option>
              <option value="recent">آخرین فعالیت</option>
            </select>
          </div>

          {rows === null && <SkeletonBlock height={120} />}
          {rows !== null && visible.length === 0 && (
            <EmptyState icon={<IconChat size={22} />} title="مشتری‌ای نیست" description="هنوز کسی با فروشگاه گفتگو نکرده است. وقتی مشتری پیام بدهد، اینجا دیده می‌شود." />
          )}
          {rows !== null && visible.length > 0 && (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr><th>مشتری</th><th>سفارش‌ها</th><th>جمع خرید</th><th>میانگین سفارش</th><th>آخرین سفارش</th><th>آخرین تماس</th><th>برچسب</th></tr>
                </thead>
                <tbody>
                  {visible.map(row => {
                    const aov = row.paidOrders > 0 ? row.value / row.paidOrders : 0;
                    const lastOrder = (ordersByChat.get(row.chatId) ?? []).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
                    const tags = [...tagsFor(row), ...(customTags[row.chatId] ?? [])];
                    return (
                      <tr key={row.chatId} onClick={() => setSelected(row)} style={{ cursor: 'pointer' }}>
                        <td>
                          <div style={{ display: 'grid', gap: 2 }}>
                            <strong>{row.name}</strong>
                            <span className="small muted">{row.username ? `@${row.username}` : '—'}</span>
                          </div>
                        </td>
                        <td>{faNum(row.orders)}</td>
                        <td>{row.value > 0 ? toman(row.value) : '—'}</td>
                        <td>{aov > 0 ? toman(aov) : '—'}</td>
                        <td>{lastOrder ? relativeTime(lastOrder.createdAt) : '—'}</td>
                        <td>{relativeTime(row.lastActivityAt)}</td>
                        <td>
                          <span className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
                            {tags.map(tag => <span key={tag} className="badge b-blue">{tag}</span>)}
                            {tags.length === 0 && <span className="small muted">—</span>}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {selected && (
        <div className="modal-backdrop" onClick={() => setSelected(null)} role="dialog" aria-modal="true" aria-label="جزئیات مشتری">
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <div className="modal-head">
              <div>
                <div className="card-title">{selected.name}</div>
                <div className="card-desc">{selected.username ? `@${selected.username}` : 'بدون نام کاربری'} · اولین تماس {relativeTime(selected.firstSeenAt)}</div>
              </div>
              <button type="button" className="btn btn-ghost btn-icon" onClick={() => setSelected(null)} aria-label="بستن"><IconX size={16} /></button>
            </div>
            <div className="modal-body" style={{ display: 'grid', gap: 14 }}>
              <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                <span className="badge b-gray">{faNum(selected.orders)} سفارش</span>
                <span className="badge b-gray">{faNum(selected.messageCount)} پیام</span>
                {selected.value > 0 && <span className="badge b-green">جمع خرید {toman(selected.value)}</span>}
                {tagsFor(selected).map(tag => <span key={tag} className="badge b-blue">{tag}</span>)}
              </div>
              <div>
                <div className="card-title" style={{ fontSize: 13 }}>سابقه‌ی سفارش‌ها</div>
                {selectedOrders.length === 0 && <p className="small muted">هنوز سفارشی ثبت نشده است.</p>}
                {selectedOrders.map(order => (
                  <div key={order.id} className="kv-row">
                    <span>{order.code} · {order.status}</span>
                    <span>{toman(order.total)}</span>
                  </div>
                ))}
              </div>
              <div>
                <label className="field-label" htmlFor="cust-note">یادداشت فروشنده</label>
                <textarea id="cust-note" className="input" rows={3} value={notes[selected.chatId] ?? ''} onChange={e => saveNotes(selected.chatId, e.target.value)} placeholder="مثلاً: سایز ۴۲ را دوست دارد…" />
              </div>
              <div>
                <label className="field-label" htmlFor="cust-tag">برچسب جدید</label>
                <div className="row" style={{ gap: 8 }}>
                  <input id="cust-tag" className="input input-sm" value={tagInput} onChange={e => setTagInput(e.target.value)} placeholder="مثلاً: همکار" />
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => addTag(selected.chatId)}>افزودن</button>
                </div>
              </div>
            </div>
            <div className="modal-foot">
              <Link href={`/app/conversations?chat=${encodeURIComponent(selected.chatId)}`} className="btn btn-primary btn-sm">
                <IconChat size={14} /> باز کردن گفتگو
              </Link>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelected(null)}>بستن</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
