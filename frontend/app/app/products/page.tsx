'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { api, ApiError, type Product, type Variant } from '@/lib/api';
import { faDateTime, faNum, relativeTime, statusOfStock, toman, variantLabel } from '@/lib/format';
import { useRealtime } from '@/lib/realtime';
import { EmptyState, Field, Modal, PageHeader, Segmented, SkeletonBlock, Spinner, Switch, useToast } from '@/components/ui';
import {
  IconAlertCircle, IconBox, IconChevronDown, IconClock, IconEdit, IconMinus,
  IconPackage, IconPlus, IconRefresh, IconSearch, IconTag, IconTrash, IconUpload,
} from '@/components/icons';
import Link from 'next/link';

type Filter = 'all' | 'attention' | 'inactive' | 'services';

const REASONS: Record<string, string> = { sale: 'فروش', restock: 'شارژ موجودی', manual: 'اصلاح دستی', initial: 'موجودی اولیه' };

export default function ProductsPage() {
  const toast = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [newOpen, setNewOpen] = useState(false);
  const [variantFor, setVariantFor] = useState<Product | null>(null);
  const [attributesFor, setAttributesFor] = useState<Product | null>(null);
  const [bulkFor, setBulkFor] = useState<Product | null>(null);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [editVariant, setEditVariant] = useState<{ product: Product; variant: Variant } | null>(null);
  const [stockFor, setStockFor] = useState<{ product: Product; variant: Variant } | null>(null);
  const [historyFor, setHistoryFor] = useState<{ product: Product; variant: Variant } | null>(null);
  const [confirmArchive, setConfirmArchive] = useState<{ kind: 'product' | 'variant'; product: Product; variant?: Variant } | null>(null);

  const load = useCallback(async () => {
    try {
      setProducts(await api.products());
    } catch (problem) {
      toast.error('بارگذاری محصولات انجام نشد', problem instanceof ApiError ? problem.message : undefined);
    } finally {
      setLoading(false);
    }
  }, [toast]);

    // رخداد زنده: هر تغییر سمت سرور (سفارش، پیام، موجودی، محصول) همین‌جا
  // بدون رفرش بازخوانی می‌شود. فعل و انفعال پنل با خودش هم بی‌ضرر است.
  useRealtime(['product', 'stock'], () => { void load(); });

useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('new') === '1') setNewOpen(true);
    if (params.get('filter') === 'attention') setFilter('attention');
    // اعلان «موجودی کم» پیوند مستقیم به همان محصول می‌دهد: باز و هایلایت می‌شود.
    const product = params.get('product');
    if (product) {
      setExpanded(product);
      setFlash(product);
      window.setTimeout(() => {
        document.getElementById(`product-${product}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }, 120);
    }
  }, []);

  useEffect(() => {
    if (!flash) return;
    const timer = window.setTimeout(() => setFlash(null), 2600);
    return () => window.clearTimeout(timer);
  }, [flash]);

  const stockOf = (product: Product) => product.variants.filter(variant => variant.active).reduce((sum, variant) => sum + variant.stock, 0);
  const priceRange = (variants: Variant[]) => {
    const prices = variants.map(variant => variant.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    return min === max ? toman(min) : `${faNum(min)} تا ${faNum(max)} تومان`;
  };
  const needsAttention = (product: Product) => product.variants.some(variant => variant.active && variant.stock <= 3);

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return products.filter(product => {
      const matchQuery = !term
        || product.title.toLowerCase().includes(term)
        || product.category.toLowerCase().includes(term)
        || product.variants.some(variant => (variant.sku ?? '').toLowerCase().includes(term) || variant.color.includes(term) || variant.size.includes(term));
      if (!matchQuery) return false;
      if (filter === 'attention') return product.active && needsAttention(product);
      if (filter === 'inactive') return !product.active;
      if (filter === 'services') return product.type === 'SERVICE';
      return true;
    });
  }, [products, query, filter]);

  const totals = useMemo(() => ({
    products: products.filter(product => product.active).length,
    variants: products.reduce((sum, product) => sum + product.variants.filter(variant => variant.active).length, 0),
    stock: products.reduce((sum, product) => sum + stockOf(product), 0),
    value: products.reduce((sum, product) => sum + product.variants.filter(variant => variant.active).reduce((inner, variant) => inner + variant.price * variant.stock, 0), 0),
  }), [products]);

  async function run(id: string, action: () => Promise<unknown>, success?: string) {
    setBusyId(id);
    try {
      await action();
      await load();
      if (success) toast.success(success);
      return true;
    } catch (problem) {
      toast.error('عملیات انجام نشد', problem instanceof ApiError ? problem.message : undefined);
      return false;
    } finally {
      setBusyId(null);
    }
  }

  /* ------------------------------------------------------------- mutations */

  async function submitProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const title = String(data.get('title') ?? '').trim();
    const type = String(data.get('type') ?? 'PRODUCT') === 'SERVICE' ? 'SERVICE' as const : 'PRODUCT' as const;
    const num = (key: string) => {
      const raw = String(data.get(key) ?? '').trim();
      return raw === '' ? null : Number(raw);
    };
    const body = {
      title,
      code: String(data.get('code') ?? '').trim() || null,
      category: String(data.get('category') ?? '').trim(),
      description: String(data.get('description') ?? '').trim(),
      type,
      isShippable: type === 'SERVICE' ? false : String(data.get('isShippable') ?? '') === 'on',
      defaultPrice: num('defaultPrice'),
      defaultStock: type === 'SERVICE' ? null : num('defaultStock'),
      compareAtPrice: num('compareAtPrice'),
      serviceDurationMinutes: type === 'SERVICE' ? num('serviceDurationMinutes') : null,
      serviceRequiresBooking: type === 'SERVICE' && String(data.get('serviceRequiresBooking') ?? '') === 'on',
      serviceCapacity: type === 'SERVICE' ? num('serviceCapacity') : null,
    };
    const ok = await run('new', () => api.createProduct(body),
      type === 'SERVICE' ? 'خدمت ساخته شد؛ قیمت و ظرفیت را تنظیم کنید.' : 'محصول ساخته شد؛ حالا ویژگی‌ها و واریانت‌ها را اضافه کنید.');
    if (ok) { setNewOpen(false); }
  }

  async function submitVariant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!variantFor) return;
    const data = new FormData(event.currentTarget);
    const body = {
      sku: String(data.get('sku') ?? '').trim() || undefined,
      size: String(data.get('size') ?? '').trim(),
      color: String(data.get('color') ?? '').trim(),
      price: Number(data.get('price')),
      stock: Number(data.get('stock')),
    };
    const ok = await run(variantFor.id, () => api.createVariant(variantFor.id, body), 'واریانت اضافه شد.');
    if (ok) { setVariantFor(null); setExpanded(variantFor.id); }
  }

  async function submitProductEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editProduct) return;
    const data = new FormData(event.currentTarget);
    const ok = await run(editProduct.id, () => api.updateProduct(editProduct.id, {
      title: String(data.get('title') ?? '').trim(),
      code: String(data.get('code') ?? '').trim() || null,
      category: String(data.get('category') ?? '').trim(),
      description: String(data.get('description') ?? '').trim(),
    }), 'محصول به‌روزرسانی شد.');
    if (ok) setEditProduct(null);
  }

  async function submitVariantEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editVariant) return;
    const data = new FormData(event.currentTarget);
    const ok = await run(editVariant.variant.id, () => api.updateVariant(editVariant.variant.id, {
      sku: String(data.get('sku') ?? '').trim() || null,
      size: String(data.get('size') ?? '').trim(),
      color: String(data.get('color') ?? '').trim(),
      price: Number(data.get('price')),
    }), 'واریانت ویرایش شد.');
    if (ok) setEditVariant(null);
  }

  async function submitStock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!stockFor) return;
    const data = new FormData(event.currentTarget);
    const amount = Math.abs(Number(data.get('amount')));
    const direction = String(data.get('direction'));
    const delta = direction === 'out' ? -amount : amount;
    const ok = await run(stockFor.variant.id, () => api.adjustStock(stockFor.variant.id, delta, direction === 'out' ? 'manual' : 'restock'),
      direction === 'out' ? 'کاهش موجودی ثبت شد.' : 'موجودی شارژ شد.');
    if (ok) setStockFor(null);
  }

  async function sell(product: Product, variant: Variant) {
    await run(variant.id, () => api.sell(variant.id, 1), `فروش ثبت شد — ${variantLabel(variant)} از «${product.title}»`);
  }

  return (
    <div className="stack">
      <PageHeader
        eyebrow="کاتالوگ"
        title="محصولات و موجودی"
        description={`${faNum(totals.products)} محصول فعال · ${faNum(totals.variants)} واریانت · ${faNum(totals.stock)} عدد موجودی · ارزش ${toman(totals.value)}`}
        actions={
          <>
            <Link href="/app/import" className="btn btn-outline"><IconUpload size={16} />ورود گروهی</Link>
            <button className="btn btn-primary" onClick={() => setNewOpen(true)}><IconPlus size={16} />محصول جدید</button>
          </>
        }
      />

      <div className="card card-pad" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="input-wrap" style={{ flex: '1 1 260px' }}>
          <IconSearch className="input-ico" size={16} />
          <input
            className="input" placeholder="جستجو در نام، دسته، سایز، رنگ یا کد کالا…"
            value={query} onChange={event => setQuery(event.target.value)} aria-label="جستجوی محصول"
          />
        </div>
        <Segmented<Filter>
          value={filter}
          onChange={setFilter}
          ariaLabel="فیلتر محصولات"
          options={[
            { value: 'all', label: 'همه' },
            { value: 'attention', label: 'کم‌موجود' },
            { value: 'services', label: 'خدمات' },
            { value: 'inactive', label: 'غیرفعال' },
          ]}
        />
        <button className="btn btn-ghost btn-sm" onClick={() => void load()} disabled={loading}>
          <IconClock size={14} />
          به‌روزرسانی
        </button>
      </div>

      {loading ? (
        <div className="stack">{[0, 1, 2].map(index => <SkeletonBlock key={index} height={120} />)}</div>
      ) : visible.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<IconBox />}
            title={products.length === 0 ? 'هنوز محصولی ثبت نشده' : 'محصولی با این فیلتر پیدا نشد'}
            description={products.length === 0
              ? 'اولین محصول را دستی اضافه کنید یا کل کاتالوگ را از فایل اکسل بارگذاری کنید.'
              : 'عبارت جستجو یا فیلتر را تغییر دهید.'}
            action={products.length === 0
              ? <div className="row" style={{ justifyContent: 'center' }}><button className="btn btn-primary" onClick={() => setNewOpen(true)}><IconPlus size={16} />محصول جدید</button><Link href="/app/import" className="btn btn-outline"><IconUpload size={16} />ورود از فایل</Link></div>
              : undefined}
          />
        </div>
      ) : (
        <div className="card rows-card">
          {visible.map(product => {
            const activeVariants = product.variants.filter(variant => variant.active);
            const stock = stockOf(product);
            const isOpen = expanded === product.id;
            return (
              <article
                className={`row-item ${flash === product.id ? 'row-flash' : ''}`}
                key={product.id}
                id={`product-${product.id}`}
                style={{ opacity: product.active ? 1 : 0.72 }}
              >
                <div className="row-item-in">
                  <button
                    className="btn btn-ghost btn-icon btn-sm"
                    onClick={() => setExpanded(isOpen ? null : product.id)}
                    aria-label={isOpen ? 'بستن جزئیات' : 'نمایش جزئیات'}
                    aria-expanded={isOpen}
                  >
                    <IconChevronDown size={16} style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
                  </button>

                  <span className="avatar avatar-brand" style={{ width: 32, height: 32 }}>
                    <IconTag size={15} />
                  </span>

                  {/* نام و موجودی کنارِ هم؛ قبلاً بلوکِ نام تمام فضای خالی را
                      می‌گرفت و عدد موجودی به انتهای ردیف پرت می‌شد.
                      برچسب وضعیت (موجودی کم/ناموجود/غیرفعال) در خط توضیح است،
                      نه کنار عنوان، تا همه‌ی کارت‌ها یک فرم داشته باشند. */}
                  <div className="row-name">
                    <div className="row" style={{ gap: 7 }}>
                      <strong style={{ fontSize: 'var(--fs-md)', fontWeight: 500 }}>{product.title}</strong>
                    </div>
                    <div className="small muted product-meta">
                      {product.category || 'بدون دسته'} · {faNum(activeVariants.length)} واریانت
                      {activeVariants.length > 0 && ` · ${priceRange(activeVariants)}`}
                      {product.type === 'SERVICE' && <span className="badge b-blue product-status">خدمت</span>}
                      {!product.active && <span className="badge b-gray product-status">غیرفعال</span>}
                      {product.active && stock === 0 && <span className="badge b-red product-status">ناموجود</span>}
                      {product.active && stock > 0 && needsAttention(product) && <span className="badge b-amber product-status">موجودی کم</span>}
                      {(product.postLinks?.length ?? 0) > 0 && <span className="badge b-blue product-status">لینک به پست</span>}
                    </div>
                    {activeVariants.length > 0 && (
                      <div className="row product-pills" style={{ gap: 5, marginTop: 6 }}>
                        {activeVariants.slice(0, 5).map(variant => (
                          <span key={variant.id} className="badge b-gray" style={{ fontWeight: 500 }}>
                            {variantLabel(variant)} · {faNum(variant.stock)}
                          </span>
                        ))}
                        {activeVariants.length > 5 && <span className="badge b-gray">+{faNum(activeVariants.length - 5)}</span>}
                      </div>
                    )}
                  </div>

                  <div className="row-spacer" />

                  <div className="row product-row-actions" style={{ gap: 6 }}>
                    <div className="row-stat product-stock-total" aria-label={`موجودی کل ${faNum(stock)} عدد`}>
                      <span className="row-stat-num">{faNum(stock)}</span>
                      <span className="small muted">عدد</span>
                    </div>
                    <button className="btn btn-outline btn-sm" onClick={() => setEditProduct(product)} disabled={busyId === product.id}>
                      <IconEdit size={14} />ویرایش
                    </button>
                    <button className="btn btn-soft btn-sm" onClick={() => setVariantFor(product)} disabled={busyId === product.id}>
                      <IconPlus size={14} />سایز / رنگ
                    </button>
                    <button className="btn btn-outline btn-sm" onClick={() => setAttributesFor(product)} disabled={busyId === product.id}>
                      <IconTag size={14} />واریانت از ویژگی‌ها
                    </button>
                    {product.active ? (
                      <button
                        className="btn btn-ghost btn-sm btn-icon" style={{ color: 'var(--danger)' }}
                        onClick={() => setConfirmArchive({ kind: 'product', product })}
                        disabled={busyId === product.id}
                        aria-label="غیرفعال‌سازی محصول" title="غیرفعال‌سازی محصول"
                      >
                        <IconTrash size={14} />
                      </button>
                    ) : (
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => void run(product.id, () => api.updateProduct(product.id, { active: true }), 'محصول دوباره فعال شد.')}
                        disabled={busyId === product.id}
                        title="فعال‌سازی محصول"
                      >
                        {busyId === product.id ? <Spinner size={13} /> : <IconRefresh size={14} />}
                        فعال‌سازی
                      </button>
                    )}
                  </div>
                </div>

                {isOpen && (
                  <div className="table-wrap" style={{ borderTop: '1px solid var(--line)' }}>
                    <table className="table">
                      <thead>
                        <tr>
                          <th>واریانت</th>
                          <th>کد کالا</th>
                          <th>قیمت</th>
                          <th>موجودی</th>
                          <th>وضعیت</th>
                          <th style={{ width: 200 }}>عملیات سریع</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeVariants.length === 0 && (
                          <tr>
                            <td colSpan={6}>
                              <div className="small muted" style={{ padding: '10px 0' }}>
                                هیچ واریانت فعالی ندارد. با دکمه «سایز / رنگ» اولین واریانت را اضافه کنید.
                              </div>
                            </td>
                          </tr>
                        )}
                        {activeVariants.map(variant => {
                          const status = statusOfStock(variant.stock);
                          const busy = busyId === variant.id;
                          return (
                            <tr key={variant.id}>
                              <td>
                                <div className="strong" style={{ fontSize: 'var(--fs-sm)' }}>{variantLabel(variant)}</div>
                              </td>
                              <td><span className="mono muted">{variant.sku || '—'}</span></td>
                              <td className="td-num nowrap">{toman(variant.price)}</td>
                              <td className="td-num">
                                <span className="strong">{faNum(variant.stock)}</span>
                                <div className="small muted">{relativeTime(variant.stockUpdatedAt)}</div>
                              </td>
                              <td><span className={`badge ${status.tone === 'green' ? 'b-green' : status.tone === 'amber' ? 'b-amber' : 'b-red'}`}><span className="dot" />{status.label}</span></td>
                              <td>
                                <div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
                                  <button
                                    className="btn btn-primary btn-sm" disabled={busy || !product.active || variant.stock === 0}
                                    onClick={() => void sell(product, variant)} title="کاهش یک عدد از موجودی و ثبت فروش"
                                  >
                                    {busy ? <Spinner size={13} /> : <IconMinus size={13} />}
                                    فروخته شد
                                  </button>
                                  <button
                                    className="btn btn-outline btn-sm btn-icon" disabled={busy}
                                    onClick={() => setStockFor({ product, variant })} aria-label="تغییر موجودی" title="تغییر موجودی"
                                  >
                                    <IconPackage size={14} />
                                  </button>
                                  <button
                                    className="btn btn-outline btn-sm btn-icon" disabled={busy}
                                    onClick={() => setEditVariant({ product, variant })} aria-label="ویرایش واریانت" title="ویرایش قیمت و مشخصات"
                                  >
                                    <IconEdit size={14} />
                                  </button>
                                  <button
                                    className="btn btn-ghost btn-sm btn-icon" disabled={busy}
                                    onClick={() => setHistoryFor({ product, variant })} aria-label="تاریخچه گردش" title="تاریخچه گردش موجودی"
                                  >
                                    <IconClock size={14} />
                                  </button>
                                  <button
                                    className="btn btn-ghost btn-sm btn-icon" disabled={busy}
                                    onClick={() => setConfirmArchive({ kind: 'variant', product, variant })}
                                    aria-label="غیرفعال‌سازی واریانت" title="غیرفعال‌سازی"
                                    style={{ color: 'var(--danger)' }}
                                  >
                                    <IconTrash size={14} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    <div className="card-foot row-between" style={{ borderTop: '1px solid var(--line)' }}>
                      <span className="row" style={{ gap: 6 }}>
                        <span className="small muted">{product.description || 'بدون توضیح'}</span>
                        {activeVariants.length > 1 && (
                          <button className="btn btn-ghost btn-sm" onClick={() => setBulkFor(product)} disabled={busyId === product.id}>
                            <IconEdit size={13} />عملیات گروهی
                          </button>
                        )}
                      </span>
                      {product.active ? (
                        <button
                          className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }}
                          onClick={() => setConfirmArchive({ kind: 'product', product })}
                        >
                          <IconTrash size={14} />غیرفعال‌سازی محصول
                        </button>
                      ) : (
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => void run(product.id, () => api.updateProduct(product.id, { active: true }), 'محصول دوباره فعال شد.')}
                          disabled={busyId === product.id}
                        >
                          {busyId === product.id ? <Spinner size={13} /> : <IconRefresh size={14} />}
                          فعال‌سازی محصول
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {/* ------------------------------------------------------------- modals */}

      <Modal
        open={newOpen} onClose={() => setNewOpen(false)} title="محصول جدید"
        description="نام محصول را وارد کنید؛ سایز، رنگ و موجودی را در قدم بعد اضافه می‌کنید."
        footer={<><button className="btn btn-ghost" onClick={() => setNewOpen(false)}>انصراف</button><button className="btn btn-primary" form="new-product" disabled={busyId === 'new'}>{busyId === 'new' && <Spinner size={14} />}ساخت محصول</button></>}
      >
        <form id="new-product" onSubmit={submitProduct} style={{ display: 'grid', gap: 14 }}>
          <Field label="نام محصول" required htmlFor="title">
            <input id="title" name="title" className="input" required maxLength={200} placeholder="مثلاً مانتو کتان تابستانه" autoFocus />
          </Field>
          <Field label="کد محصول" htmlFor="code" hint="اختیاری — برای ایمپورت گروهی و SKU خودکار استفاده می‌شود.">
            <input id="code" name="code" className="input input-ltr" maxLength={100} placeholder="SHOE-001" />
          </Field>
          <Field label="نوع" htmlFor="type" hint="خدمت‌ها موجودی و ارسال ندارند؛ قیمت و ظرفیت دارند.">
            <select id="type" name="type" className="input" defaultValue="PRODUCT">
              <option value="PRODUCT">کالای فیزیکی</option>
              <option value="SERVICE">خدمت</option>
            </select>
          </Field>
          <Field label="دسته‌بندی" htmlFor="category" hint="اختیاری — برای جستجو و فیلتر مفید است.">
            <input id="category" name="category" className="input" maxLength={200} placeholder="مانتو، شال، کیف…" />
          </Field>
          <Field label="توضیح" htmlFor="description">
            <textarea id="description" name="description" className="textarea" maxLength={2000} placeholder="جنس، برش، نکات نگهداری…" />
          </Field>
          <div className="grid g-2">
            <Field label="قیمت پیش‌فرض (تومان)" htmlFor="defaultPrice" hint="در «تولید ترکیب» در همه‌ی واریانت‌ها پیش‌پر می‌شود.">
              <input id="defaultPrice" name="defaultPrice" type="number" min={0} max={2147483647} className="input input-ltr" placeholder="890000" />
            </Field>
            <Field label="موجودی پیش‌فرض" htmlFor="defaultStock">
              <input id="defaultStock" name="defaultStock" type="number" min={0} max={2147483647} className="input input-ltr" placeholder="10" />
            </Field>
          </div>
          <div className="grid g-2">
            <Field label="قیمت قبل از تخفیف (تومان)" htmlFor="compareAtPrice">
              <input id="compareAtPrice" name="compareAtPrice" type="number" min={0} max={2147483647} className="input input-ltr" placeholder="اختیاری" />
            </Field>
            <Field label="مدت خدمت (دقیقه)" htmlFor="serviceDurationMinutes" hint="فقط برای خدمت.">
              <input id="serviceDurationMinutes" name="serviceDurationMinutes" type="number" min={1} max={100000} className="input input-ltr" placeholder="60" />
            </Field>
          </div>
          <div className="row" style={{ gap: 16, flexWrap: 'wrap' }}>
            <label className="row" style={{ gap: 6 }}>
              <input type="checkbox" name="isShippable" defaultChecked />
              <span className="small">قابل ارسال است</span>
            </label>
            <label className="row" style={{ gap: 6 }}>
              <input type="checkbox" name="serviceRequiresBooking" />
              <span className="small">نیاز به نوبت/رزرو دارد</span>
            </label>
          </div>
          <Field label="ظرفیت هر نوبت" htmlFor="serviceCapacity" hint="فقط برای خدمتِ رزروی.">
            <input id="serviceCapacity" name="serviceCapacity" type="number" min={1} max={100000} className="input input-ltr" placeholder="5" />
          </Field>
        </form>
      </Modal>

      <Modal
        open={Boolean(variantFor)} onClose={() => setVariantFor(null)}
        title={`افزودن سایز / رنگ`} description={variantFor?.title}
        footer={<><button className="btn btn-ghost" onClick={() => setVariantFor(null)}>انصراف</button><button className="btn btn-primary" form="new-variant" disabled={busyId === variantFor?.id}>{busyId === variantFor?.id && <Spinner size={14} />}ثبت واریانت</button></>}
      >
        <form id="new-variant" onSubmit={submitVariant} style={{ display: 'grid', gap: 14 }}>
          <div className="grid g-2">
            <Field label="سایز" htmlFor="size"><input id="size" name="size" className="input" maxLength={200} placeholder="M / ۳۸ / Free" /></Field>
            <Field label="رنگ" htmlFor="color"><input id="color" name="color" className="input" maxLength={200} placeholder="مشکی، کرم…" /></Field>
          </div>
          <div className="grid g-2">
            <Field label="قیمت (تومان)" required htmlFor="price"><input id="price" name="price" type="number" min={0} max={2147483647} className="input input-ltr" required placeholder="890000" /></Field>
            <Field label="موجودی اولیه" required htmlFor="stock"><input id="stock" name="stock" type="number" min={0} max={2147483647} className="input input-ltr" required defaultValue={0} /></Field>
          </div>
          <Field label="کد کالا (SKU)" htmlFor="sku" hint="اختیاری و در هر فروشگاه یکتا است.">
            <input id="sku" name="sku" className="input input-ltr" maxLength={200} placeholder="MN-KTN-M-KRM" />
          </Field>
        </form>
      </Modal>

      <Modal
        open={Boolean(editProduct)} onClose={() => setEditProduct(null)} title="ویرایش محصول"
        footer={<><button className="btn btn-ghost" onClick={() => setEditProduct(null)}>انصراف</button><button className="btn btn-primary" form="edit-product" disabled={busyId === editProduct?.id}>{busyId === editProduct?.id && <Spinner size={14} />}ذخیره تغییرات</button></>}
      >
        {editProduct && (
          <form id="edit-product" onSubmit={submitProductEdit} style={{ display: 'grid', gap: 14 }}>
            <Field label="نام محصول" required htmlFor="ep-title">
              <input id="ep-title" name="title" className="input" required maxLength={200} defaultValue={editProduct.title} />
            </Field>
            <Field label="کد محصول" htmlFor="ep-code">
              <input id="ep-code" name="code" className="input input-ltr" maxLength={100} defaultValue={editProduct.code ?? ''} />
            </Field>
            <PostLinks productId={editProduct.id} />
            <Field label="دسته‌بندی" htmlFor="ep-category">
              <input id="ep-category" name="category" className="input" maxLength={200} defaultValue={editProduct.category} />
            </Field>
            <Field label="توضیح" htmlFor="ep-desc">
              <textarea id="ep-desc" name="description" className="textarea" maxLength={2000} defaultValue={editProduct.description} />
            </Field>
            <div className="row-between" style={{ borderTop: '1px solid var(--line)', paddingTop: 14 }}>
              <Switch
                label="محصول فعال باشد" checked={editProduct.active}
                onChange={async next => {
                  await run(editProduct.id, () => api.updateProduct(editProduct.id, { active: next }), next ? 'محصول فعال شد.' : 'محصول غیرفعال شد.');
                  setEditProduct(current => (current ? { ...current, active: next } : current));
                }}
              />
            </div>
          </form>
        )}
      </Modal>

      <Modal
        open={Boolean(editVariant)} onClose={() => setEditVariant(null)} title="ویرایش واریانت"
        description={editVariant ? `${editVariant.product.title} — ${variantLabel(editVariant.variant)}` : undefined}
        footer={<><button className="btn btn-ghost" onClick={() => setEditVariant(null)}>انصراف</button><button className="btn btn-primary" form="edit-variant" disabled={busyId === editVariant?.variant.id}>{busyId === editVariant?.variant.id && <Spinner size={14} />}ذخیره</button></>}
      >
        {editVariant && (
          <form id="edit-variant" onSubmit={submitVariantEdit} style={{ display: 'grid', gap: 14 }}>
            <Field label="قیمت (تومان)" required htmlFor="ev-price">
              <input id="ev-price" name="price" type="number" min={0} max={2147483647} className="input input-ltr" required defaultValue={editVariant.variant.price} />
            </Field>
            <div className="grid g-2">
              <Field label="سایز" htmlFor="ev-size"><input id="ev-size" name="size" className="input" maxLength={200} defaultValue={editVariant.variant.size} /></Field>
              <Field label="رنگ" htmlFor="ev-color"><input id="ev-color" name="color" className="input" maxLength={200} defaultValue={editVariant.variant.color} /></Field>
            </div>
            <Field label="کد کالا (SKU)" htmlFor="ev-sku"><input id="ev-sku" name="sku" className="input input-ltr" maxLength={200} defaultValue={editVariant.variant.sku ?? ''} /></Field>
            <div className="alert alert-info"><IconAlertCircle /><span>برای تغییر موجودی از دکمه «تغییر موجودی» استفاده کنید تا در دفتر گردش ثبت شود.</span></div>
          </form>
        )}
      </Modal>

      <Modal
        open={Boolean(stockFor)} onClose={() => setStockFor(null)} title="تغییر موجودی"
        description={stockFor ? `${stockFor.product.title} — ${variantLabel(stockFor.variant)} · موجودی فعلی ${faNum(stockFor.variant.stock)}` : undefined}
        footer={<><button className="btn btn-ghost" onClick={() => setStockFor(null)}>انصراف</button><button className="btn btn-primary" form="stock-form" disabled={busyId === stockFor?.variant.id}>{busyId === stockFor?.variant.id && <Spinner size={14} />}ثبت تغییر</button></>}
      >
        <form id="stock-form" onSubmit={submitStock} style={{ display: 'grid', gap: 14 }}>
          <Field label="نوع تغییر" required htmlFor="direction">
            <select id="direction" name="direction" className="select" defaultValue="in">
              <option value="in">افزایش موجودی (شارژ / مرجوعی)</option>
              <option value="out">کاهش موجودی (فروش / خرابی)</option>
            </select>
          </Field>
          <Field label="تعداد" required htmlFor="amount" hint="هر تغییر همراه با دلیل در دفتر گردش ثبت می‌شود.">
            <input id="amount" name="amount" type="number" min={1} max={2147483647} className="input input-ltr" required defaultValue={1} />
          </Field>
        </form>
      </Modal>

      {attributesFor && (
        <AttributesModal
          product={attributesFor}
          onClose={() => setAttributesFor(null)}
          onSaved={() => { setAttributesFor(null); void load(); }}
        />
      )}

      {bulkFor && (
        <BulkModal
          product={bulkFor}
          onClose={() => setBulkFor(null)}
          onSaved={() => { setBulkFor(null); void load(); }}
        />
      )}

      {historyFor && (
        <MovementsModal
          target={historyFor}
          onClose={() => setHistoryFor(null)}
        />
      )}

      <Modal
        open={Boolean(confirmArchive)} onClose={() => setConfirmArchive(null)}
        title={confirmArchive?.kind === 'product' ? 'غیرفعال‌سازی محصول' : 'غیرفعال‌سازی واریانت'}
        description="این عملیات داده‌ها را حذف نمی‌کند؛ فقط از پاسخ‌های خودکار و فهرست فروش کنار می‌رود."
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setConfirmArchive(null)}>انصراف</button>
            <button
              className="btn btn-danger"
              onClick={async () => {
                if (!confirmArchive) return;
                const target = confirmArchive;
                const variant = target.variant;
                setConfirmArchive(null);
                if (target.kind === 'product') await run(target.product.id, () => api.archiveProduct(target.product.id), 'محصول غیرفعال شد.');
                else if (variant) await run(variant.id, () => api.archiveVariant(variant.id), 'واریانت غیرفعال شد.');
              }}
            >
              <IconTrash size={15} />
              بله، غیرفعال کن
            </button>
          </>
        }
      >
        <div className="alert alert-warn">
          <IconAlertCircle />
          <span>
            {confirmArchive?.kind === 'product'
              ? `محصول «${confirmArchive.product.title}» غیرفعال می‌شود و دیگر در پاسخ‌های خودکار استفاده نخواهد شد.`
              : `واریانت «${confirmArchive?.variant ? variantLabel(confirmArchive.variant) : ''}» غیرفعال می‌شود.`}
          </span>
        </div>
      </Modal>
    </div>
  );
}

/* ------------------------------------------------------------ attributes */

type AttrDraft = { name: string; values: string[] };

type DraftRow = { key: string; options: Record<string, string>; price: number; stock: number };

function comboKeyOf(options: Record<string, string>): string {
  return Object.keys(options).sort().map(name => `${name}=${options[name]}`).join('|');
}

function AttributesModal({ product, onClose, onSaved }: { product: Product; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [drafts, setDrafts] = useState<AttrDraft[]>(() =>
    (product.attributes ?? []).map(attr => ({ name: attr.name, values: attr.values.map(v => v.value) })),
  );
  const [suggestions, setSuggestions] = useState<{ names: string[]; valuesByName: Record<string, string[]> } | null>(null);
  const [busy, setBusy] = useState(false);
  // ویرایش‌های قیمت/موجودی هر ترکیب (کلید = comboKey) و ترکیب‌های حذف‌شده از پیش‌نویس.
  const [edits, setEdits] = useState<Record<string, { price: number; stock: number }>>({});
  const [removed, setRemoved] = useState<Set<string>>(new Set());

  useEffect(() => {
    api.attributeSuggestions().then(setSuggestions).catch(() => setSuggestions(null));
  }, []);

  // نام‌های تکراری ادغام می‌شوند (اجتماع مقادیر) تا ترکیب همه‌ی حالت‌ها ساخته شود؛
  // مثلاً دو ردیف «رنگ» یکی می‌شوند و همه‌ی رنگ‌ها در ضرب دکارتی می‌آیند.
  const cleaned = (() => {
    const merged: AttrDraft[] = [];
    const byName = new Map<string, AttrDraft>();
    for (const draft of drafts) {
      const name = draft.name.trim();
      const values = draft.values.map(v => v.trim()).filter(Boolean);
      if (!name || values.length === 0) continue;
      const existing = byName.get(name);
      if (existing) {
        existing.values = [...new Set([...existing.values, ...values])];
      } else {
        const row = { name, values: [...new Set(values)] };
        byName.set(name, row);
        merged.push(row);
      }
    }
    return merged;
  })();

  // ترکیب‌های مرتب: ضرب دکارتی ویژگی‌ها (مثل رنگ × سایز → مشکی/M، مشکی/L، آبی/M، آبی/L).
  const preview = useMemo(() => {
    if (cleaned.length === 0) return [] as Record<string, string>[];
    let combos: Record<string, string>[] = [{}];
    for (const attr of cleaned) {
      const next: Record<string, string>[] = [];
      for (const base of combos) {
        for (const value of attr.values) next.push({ ...base, [attr.name]: value });
      }
      combos = next;
    }
    return combos;
  }, [drafts]);

  const defaultPrice = product.defaultPrice ?? 0;
  const defaultStock = product.defaultStock ?? 0;

  // ردیف‌های پیش‌نویس: هر ترکیب یک ردیف با قیمت/موجودی قابل‌ویرایش؛ پیش‌فرض از خود محصول.
  const rows: DraftRow[] = useMemo(() => preview
    .map(combo => {
      const key = comboKeyOf(combo);
      const edit = edits[key];
      return { key, options: combo, price: edit?.price ?? defaultPrice, stock: edit?.stock ?? defaultStock };
    })
    .filter(row => !removed.has(row.key)), [preview, edits, removed, defaultPrice, defaultStock]);

  const totalCombos = preview.length;

  function updateDraft(index: number, patch: Partial<AttrDraft>) {
    setDrafts(current => current.map((draft, i) => (i === index ? { ...draft, ...patch } : draft)));
  }

  function updateRow(key: string, patch: { price?: number; stock?: number }) {
    setEdits(current => {
      const base = current[key] ?? { price: defaultPrice, stock: defaultStock };
      return { ...current, [key]: { ...base, ...patch } };
    });
  }

  function removeRow(key: string) {
    setRemoved(current => new Set(current).add(key));
  }

  /** ثبت دسته‌ای: ویژگی‌ها ذخیره می‌شوند و هر ردیف با قیمت/موجودیِ خودش ثبت می‌شود. */
  async function registerVariants() {
    if (cleaned.length === 0) { toast.error('حداقل یک ویژگی با حداقل یک مقدار لازم است.'); return; }
    if (totalCombos > 100) { toast.error(`تعداد ترکیب‌ها (${faNum(totalCombos)}) از سقف ۱۰۰ گذشته است.`); return; }
    if (rows.length === 0) { toast.error('همه‌ی ترکیب‌ها حذف شده‌اند؛ دست‌کم یک واریانت لازم است.'); return; }
    if (rows.some(row => !Number.isInteger(row.price) || row.price < 0 || !Number.isInteger(row.stock) || row.stock < 0)) {
      toast.error('قیمت و موجودی هر واریانت باید عدد صحیح نامنفی باشد.');
      return;
    }
    setBusy(true);
    try {
      const result = await api.createVariantsBatch(product.id, {
        attributes: cleaned,
        variants: rows.map(row => ({ options: row.options, price: row.price, stock: row.stock })),
      });
      toast.success(`واریانت‌ها ثبت شدند: ${faNum(result.created)} جدید، ${faNum(result.updated)} به‌روز شد.`);
      onSaved();
    } catch (problem) {
      toast.error('ثبت واریانت‌ها انجام نشد', problem instanceof ApiError ? problem.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open onClose={onClose} size="lg" title="ساخت واریانت از ویژگی‌ها"
      description={`${product.title} — ویژگی‌ها را بنویسید (مثل رنگ و سایز)؛ ترکیب‌ها به ترتیب ساخته می‌شوند و قیمت/موجودی هر کدام را می‌توانید جدا تغییر دهید.`}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>انصراف</button>
          <button className="btn btn-primary" onClick={() => void registerVariants()} disabled={busy || cleaned.length === 0 || totalCombos > 100 || rows.length === 0}>
            {busy && <Spinner size={14} />}ثبت وارینت‌ها ({faNum(rows.length)})
          </button>
        </>
      }
    >
      <div className="stack">
        <div className="small muted" style={{ lineHeight: 1.9 }}>
          <strong>قدم ۱:</strong> هر ویژگی را با نام و مقدارهایش بنویسید. <strong>قدم ۲:</strong> ترکیب‌های مرتب را پایین ببینید و قیمت/موجودی هر کدام را در صورت نیاز تغییر دهید. <strong>قدم ۳:</strong> «ثبت وارینت‌ها» را بزنید.
        </div>
        {drafts.map((draft, index) => (
          <div key={index} className="card card-pad" style={{ display: 'grid', gap: 10 }}>
            <div className="row" style={{ gap: 8 }}>
              <input
                className="input" style={{ maxWidth: 220 }} placeholder="نام ویژگی (رنگ، سایز، جنس…)"
                value={draft.name} list={suggestions ? 'attr-names' : undefined}
                onChange={event => updateDraft(index, { name: event.target.value })}
                aria-label={`نام ویژگی ${faNum(index + 1)}`}
              />
              <button className="btn btn-ghost btn-sm" onClick={() => setDrafts(current => current.filter((_, i) => i !== index))} aria-label="حذف ویژگی">
                <IconTrash size={14} />
              </button>
            </div>
            <input
              className="input" placeholder="مقادیر را با کاما جدا کنید: مشکی، قهوه‌ای"
              value={draft.values.join('، ')}
              list={suggestions && draft.name ? 'attr-values' : undefined}
              onChange={event => updateDraft(index, { values: event.target.value.split(/[،,]/).map(v => v.trim()) })}
              aria-label={`مقادیر ویژگی ${draft.name || faNum(index + 1)}`}
            />
            {suggestions && draft.name && suggestions.valuesByName[draft.name] && (
              <div className="row" style={{ gap: 5, flexWrap: 'wrap' }}>
                {suggestions.valuesByName[draft.name].map(value => (
                  <button key={value} type="button" className="badge b-gray" style={{ cursor: 'pointer' }} onClick={() => updateDraft(index, { values: [...new Set([...draft.values.filter(Boolean), value])] })}>
                    + {value}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
        {suggestions && (
          <datalist id="attr-names">
            {suggestions.names.map(name => <option key={name} value={name} />)}
          </datalist>
        )}
        <button className="btn btn-outline btn-sm" onClick={() => setDrafts(current => [...current, { name: '', values: [] }])}>
          <IconPlus size={14} />افزودن ویژگی
        </button>

        {cleaned.length > 0 && (
          <div className="card card-pad" style={{ display: 'grid', gap: 8 }}>
            <div className="row-between">
              <strong style={{ fontSize: 'var(--fs-sm)' }}>پیش‌نویس واریانت‌ها ({faNum(rows.length)} واریانت)</strong>
              <span className="small muted">پیش‌فرض قیمت و موجودی از محصول گرفته شده و برای هر ردیف قابل تغییر است</span>
            </div>
            <div style={{ display: 'grid', gap: 6, maxHeight: 260, overflowY: 'auto' }}>
              {rows.slice(0, 100).map(row => (
                <div key={row.key} className="row" style={{ gap: 8, alignItems: 'center', borderBottom: '1px dashed var(--line)', paddingBottom: 6 }}>
                  <span className="badge b-blue" style={{ fontWeight: 500, flex: '1 1 auto', minWidth: 0 }}>
                    {Object.entries(row.options).map(([k, v]) => `${k}: ${v}`).join(' · ')}
                  </span>
                  <label className="small muted" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    قیمت
                    <input
                      className="input input-ltr" type="number" min={0} step={1} style={{ width: 110 }}
                      value={row.price}
                      onChange={event => updateRow(row.key, { price: Number(event.target.value) })}
                      aria-label={`قیمت واریانت ${Object.values(row.options).join(' ')}`}
                    />
                  </label>
                  <label className="small muted" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    موجودی
                    <input
                      className="input input-ltr" type="number" min={0} step={1} style={{ width: 80 }}
                      value={row.stock}
                      onChange={event => updateRow(row.key, { stock: Number(event.target.value) })}
                      aria-label={`موجودی واریانت ${Object.values(row.options).join(' ')}`}
                    />
                  </label>
                  <button className="btn btn-ghost btn-sm" onClick={() => removeRow(row.key)} aria-label="حذف این ترکیب از پیش‌نویس">
                    <IconTrash size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {totalCombos > 100 && (
          <div className="alert alert-error">
            <IconAlertCircle />
            <span>تعداد ترکیب‌ها ({faNum(totalCombos)}) از سقف ۱۰۰ گذشته است؛ تعداد مقادیر ویژگی‌ها را کم کنید.</span>
          </div>
        )}
        <div className="alert alert-info">
          <IconAlertCircle />
          <span>حداکثر ۱۰۰ واریانت ثبت می‌شود. ترکیب‌هایی که قبلاً ثبت شده‌اند با قیمت و موجودی همین پیش‌نویس به‌روز می‌شوند. همین ویژگی‌ها را می‌توانید از فایل اکسل هم وارد کنید (ستون‌های <span dir="ltr">attribute_N/value_N</span>).</span>
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------ post links (تسک ۸) */

function PostLinks({ productId }: { productId: string }) {
  const toast = useToast();
  const [links, setLinks] = useState<{ id: string; mediaId: string; shortcode: string }[] | null>(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => api.listPostLinks(productId).then(setLinks).catch(() => setLinks([]));
  useEffect(() => { void load(); }, [productId]);

  const add = async () => {
    if (!input.trim()) return;
    setBusy(true);
    try {
      await api.addPostLink(productId, input.trim());
      setInput('');
      toast.success('پست لینک شد', 'کامنت روی این پست، اطلاعات همین محصول را در دایرکت می‌فرستد.');
      void load();
    } catch (problem) {
      toast.error('لینک پست انجام نشد', problem instanceof ApiError ? problem.message : undefined);
    } finally { setBusy(false); }
  };

  return (
    <div className="stack" style={{ gap: 8 }}>
      <Field label="لینک پست اینستاگرام" htmlFor="post-link" hint="اختیاری — کامنت روی این پست، اطلاعات همین محصول را در دایرکت می‌فرستد. چند پست برای یک محصول ممکن است.">
        <div className="row" style={{ gap: 8 }}>
          <input id="post-link" className="input input-ltr" dir="ltr" value={input} onChange={e => setInput(e.target.value)} placeholder="https://www.instagram.com/p/…" />
          <button type="button" className="btn btn-outline btn-sm" disabled={busy || !input.trim()} onClick={() => void add()}>{busy ? <Spinner size={13} /> : null}افزودن</button>
        </div>
      </Field>
      {links !== null && links.length > 0 && (
        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
          {links.map(link => (
            <span key={link.id} className="badge b-blue">
              {link.shortcode ? `پست ${link.shortcode}` : `مدیا ${link.mediaId}`}
              <button type="button" aria-label="حذف لینک" style={{ border: 0, background: 'none', cursor: 'pointer', marginInlineStart: 4 }} onClick={() => void api.removePostLink(productId, link.id).then(load).catch(() => undefined)}>×</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ bulk */

function BulkModal({ product, onClose, onSaved }: { product: Product; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [priceMode, setPriceMode] = useState<'set' | 'percent'>('set');
  const [priceValue, setPriceValue] = useState('');
  const [stockMode, setStockMode] = useState<'set' | 'add'>('set');
  const [stockValue, setStockValue] = useState('');
  const [busy, setBusy] = useState(false);
  const variants = product.variants.filter(v => v.active);

  async function apply() {
    const body: Parameters<typeof api.bulkVariants>[1] = {
      variantIds: selected.size > 0 ? [...selected] : undefined,
    };
    if (priceValue.trim() !== '') { body.priceMode = priceMode; body.priceValue = Number(priceValue); }
    if (stockValue.trim() !== '') { body.stockMode = stockMode; body.stockValue = Number(stockValue); }
    if (body.priceMode === undefined && body.stockMode === undefined) {
      toast.error('حداقل قیمت یا موجودی را وارد کنید.');
      return;
    }
    setBusy(true);
    try {
      const result = await api.bulkVariants(product.id, body);
      toast.success(`${faNum(result.updated)} واریانت به‌روزرسانی شد.`);
      onSaved();
    } catch (problem) {
      toast.error('عملیات گروهی انجام نشد', problem instanceof ApiError ? problem.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open onClose={onClose} size="lg" title="عملیات گروهی روی واریانت‌ها"
      description={`${product.title} — اگر واریانتی را انتخاب نکنید، روی همه اعمال می‌شود.`}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>انصراف</button>
          <button className="btn btn-primary" onClick={() => void apply()} disabled={busy}>
            {busy && <Spinner size={14} />}اعمال روی {faNum(selected.size > 0 ? selected.size : variants.length)} واریانت
          </button>
        </>
      }
    >
      <div className="stack">
        <div className="grid g-2">
          <Field label="قیمت" htmlFor="bulk-price-mode">
            <div className="row" style={{ gap: 6 }}>
              <select id="bulk-price-mode" className="select" value={priceMode} onChange={event => setPriceMode(event.target.value as 'set' | 'percent')}>
                <option value="set">تنظیم مستقیم (تومان)</option>
                <option value="percent">درصد تغییر</option>
              </select>
              <input className="input input-ltr" type="number" placeholder={priceMode === 'set' ? '890000' : '10'} value={priceValue} onChange={event => setPriceValue(event.target.value)} aria-label="مقدار قیمت" />
            </div>
          </Field>
          <Field label="موجودی" htmlFor="bulk-stock-mode">
            <div className="row" style={{ gap: 6 }}>
              <select id="bulk-stock-mode" className="select" value={stockMode} onChange={event => setStockMode(event.target.value as 'set' | 'add')}>
                <option value="set">تنظیم مستقیم</option>
                <option value="add">افزودن/کاهش</option>
              </select>
              <input className="input input-ltr" type="number" placeholder="10" value={stockValue} onChange={event => setStockValue(event.target.value)} aria-label="مقدار موجودی" />
            </div>
          </Field>
        </div>
        <div className="stack" style={{ gap: 6 }}>
          {variants.map(variant => (
            <label key={variant.id} className="row" style={{ gap: 8, alignItems: 'center' }}>
              <input
                type="checkbox" checked={selected.has(variant.id)}
                onChange={event => setSelected(current => {
                  const next = new Set(current);
                  if (event.target.checked) next.add(variant.id); else next.delete(variant.id);
                  return next;
                })}
              />
              <span className="small">{variantLabel(variant)}</span>
              <span className="small muted">{toman(variant.price)} · {faNum(variant.stock)} عدد</span>
            </label>
          ))}
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------ movements list */

function MovementsModal({ target, onClose }: { target: { product: Product; variant: Variant }; onClose: () => void }) {
  const [rows, setRows] = useState<{ id: string; delta: number; reason: string; createdAt: string }[] | null>(null);
  const [error, setError] = useState('');
  const variantId = target.variant.id;

  useEffect(() => {
    api.movements(variantId)
      .then(setRows)
      .catch((problem: unknown) => setError(problem instanceof ApiError ? problem.message : 'دریافت تاریخچه انجام نشد.'));
  }, [variantId]);

  return (
    <Modal
      open onClose={onClose} size="lg"
      title="دفتر گردش موجودی"
      description={`${target.product.title} — ${variantLabel(target.variant)}`}
      footer={<button className="btn btn-outline" onClick={onClose}>بستن</button>}
    >
      {error && <div className="alert alert-error"><IconAlertCircle /><span>{error}</span></div>}
      {!rows && !error && <div className="stack">{<SkeletonBlock height={54} />}<SkeletonBlock height={54} /></div>}
      {rows && rows.length === 0 && (
        <EmptyState icon={<IconClock />} title="گردشی ثبت نشده" description="هنوز هیچ تغییر موجودی برای این واریانت ثبت نشده است." />
      )}
      {rows && rows.length > 0 && (
        <div className="list" style={{ margin: '0 calc(-1 * var(--sp-5))' }}>
          {rows.map(row => (
            <div className="list-row" key={row.id}>
              <span className="avatar" style={{
                background: row.delta < 0 ? 'var(--danger-soft)' : 'var(--ok-soft)',
                color: row.delta < 0 ? 'var(--danger)' : 'var(--ok)',
                borderColor: row.delta < 0 ? 'var(--danger-line)' : '#cbe9db',
              }}>
                {row.delta < 0 ? '−' : '+'}
              </span>
              <div className="list-main">
                <div className="list-title" style={{ fontSize: 'var(--fs-sm)' }}>{REASONS[row.reason] ?? row.reason}</div>
                <div className="list-sub">{faDateTime(row.createdAt)}</div>
              </div>
              <strong className="num" style={{ color: row.delta < 0 ? 'var(--danger)' : 'var(--ok)' }}>
                {row.delta < 0 ? '−' : '+'}{faNum(Math.abs(row.delta))}
              </strong>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
