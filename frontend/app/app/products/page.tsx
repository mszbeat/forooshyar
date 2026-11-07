'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { api, ApiError, type Product, type Variant } from '@/lib/api';
import { faDateTime, faNum, relativeTime, statusOfStock, toman, variantLabel } from '@/lib/format';
import { EmptyState, Field, Modal, PageHeader, Segmented, SkeletonBlock, Spinner, Switch, useToast } from '@/components/ui';
import {
  IconAlertCircle, IconBox, IconChevronDown, IconClock, IconEdit, IconMinus,
  IconPackage, IconPlus, IconSearch, IconTag, IconTrash, IconUpload,
} from '@/components/icons';
import Link from 'next/link';

type Filter = 'all' | 'attention' | 'inactive';

const REASONS: Record<string, string> = { sale: 'فروش', restock: 'شارژ موجودی', manual: 'اصلاح دستی', initial: 'موجودی اولیه' };

export default function ProductsPage() {
  const toast = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [newOpen, setNewOpen] = useState(false);
  const [variantFor, setVariantFor] = useState<Product | null>(null);
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

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('new') === '1') setNewOpen(true);
    if (params.get('filter') === 'attention') setFilter('attention');
  }, []);

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
    const body = {
      title,
      category: String(data.get('category') ?? '').trim(),
      description: String(data.get('description') ?? '').trim(),
    };
    const ok = await run('new', () => api.createProduct(body), 'محصول ساخته شد؛ حالا سایز و موجودی را اضافه کنید.');
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
              <article className="row-item" key={product.id} style={{ opacity: product.active ? 1 : 0.72 }}>
                <div className="row-item-in">
                  <button
                    className="btn btn-ghost btn-icon btn-sm"
                    onClick={() => setExpanded(isOpen ? null : product.id)}
                    aria-label={isOpen ? 'بستن جزئیات' : 'نمایش جزئیات'}
                    aria-expanded={isOpen}
                  >
                    <IconChevronDown size={16} style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
                  </button>

                  <span className="avatar avatar-brand" style={{ width: 34, height: 34 }}>
                    <IconTag size={16} />
                  </span>

                  <div style={{ minWidth: 0, flex: '1 1 260px' }}>
                    <div className="row" style={{ gap: 8 }}>
                      <strong style={{ fontSize: 'var(--fs-md)', fontWeight: 500 }}>{product.title}</strong>
                      {!product.active && <span className="badge b-gray">غیرفعال</span>}
                      {product.active && stock === 0 && <span className="badge b-red">ناموجود</span>}
                      {product.active && stock > 0 && needsAttention(product) && <span className="badge b-amber">موجودی کم</span>}
                    </div>
                    <div className="small muted">
                      {product.category || 'بدون دسته'} · {faNum(activeVariants.length)} واریانت
                      {activeVariants.length > 0 && ` · ${priceRange(activeVariants)}`}
                    </div>
                    {activeVariants.length > 0 && (
                      <div className="row" style={{ gap: 5, marginTop: 7 }}>
                        {activeVariants.slice(0, 5).map(variant => (
                          <span key={variant.id} className={`badge ${variant.stock === 0 ? 'b-red' : variant.stock <= 3 ? 'b-amber' : 'b-gray'}`} style={{ fontWeight: 500 }}>
                            {variantLabel(variant)} · {faNum(variant.stock)}
                          </span>
                        ))}
                        {activeVariants.length > 5 && <span className="badge b-gray">+{faNum(activeVariants.length - 5)}</span>}
                      </div>
                    )}
                  </div>

                  <div style={{ textAlign: 'center', minWidth: 78 }}>
                    <div className="num" style={{ fontWeight: 300, fontSize: 22 }}>{faNum(stock)}</div>
                    <div className="small muted">عدد موجودی</div>
                  </div>

                  <div className="row" style={{ gap: 6 }}>
                    <button className="btn btn-outline btn-sm" onClick={() => setEditProduct(product)} disabled={busyId === product.id}>
                      <IconEdit size={14} />ویرایش
                    </button>
                    <button className="btn btn-soft btn-sm" onClick={() => setVariantFor(product)} disabled={busyId === product.id}>
                      <IconPlus size={14} />سایز / رنگ
                    </button>
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
                      <span className="small muted">{product.description || 'بدون توضیح'}</span>
                      <button
                        className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }}
                        onClick={() => setConfirmArchive({ kind: 'product', product })}
                      >
                        <IconTrash size={14} />غیرفعال‌سازی محصول
                      </button>
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
          <Field label="دسته‌بندی" htmlFor="category" hint="اختیاری — برای جستجو و فیلتر مفید است.">
            <input id="category" name="category" className="input" maxLength={200} placeholder="مانتو، شال، کیف…" />
          </Field>
          <Field label="توضیح" htmlFor="description">
            <textarea id="description" name="description" className="textarea" maxLength={2000} placeholder="جنس، برش، نکات نگهداری…" />
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
