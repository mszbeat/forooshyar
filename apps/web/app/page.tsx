'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import './styles.css';

type Variant = { id: string; size: string; color: string; price: number; stock: number; stockUpdatedAt: string };
type Product = { id: string; title: string; active: boolean; variants: Variant[] };
type Shop = { name: string; tone: string; shipping: string; payment: string; workingHours: string; handoffMessage: string };
type ImportResult = { imported: number; failed: number; results: { row: number; status: string; errors?: string[] }[] };
const apiBase = (process.env.NEXT_PUBLIC_API_BASE_URL || '').replace(/\/$/, '');
const faNumber = (value: number) => value.toLocaleString('fa-IR');

export default function Home() {
  const [token, setToken] = useState('');
  const [register, setRegister] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [shop, setShop] = useState<Shop | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<ImportResult | null>(null);
  const [preview, setPreview] = useState<{kind: string; text: string} | null>(null);

  const request = useCallback(async <T,>(path: string, options: RequestInit = {}, auth = token): Promise<T> => {
    if (!apiBase) throw new Error('آدرس API تنظیم نشده است.');
    const response = await fetch(`${apiBase}${path}`, { ...options, headers: { ...(options.body && !(options.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}), ...(auth ? { Authorization: `Bearer ${auth}` } : {}), ...options.headers } });
    if (!response.ok) {
      if (response.status === 401) throw new Error('اطلاعات ورود نامعتبر است یا نشست شما پایان یافته است.');
      if (response.status === 409) throw new Error('عملیات با وضعیت فعلی موجودی یا اطلاعات تکراری سازگار نیست.');
      if (response.status === 429) throw new Error('درخواست‌ها بیش از حد است؛ کمی بعد دوباره تلاش کنید.');
      throw new Error(`درخواست انجام نشد (خطای ${response.status}).`);
    }
    return response.json() as Promise<T>;
  }, [token]);
  const refresh = useCallback(async () => {
    const [list, settings] = await Promise.all([request<Product[]>('/products'), request<Shop>('/shop')]);
    setProducts(list); setShop(settings);
  }, [request]);
  useEffect(() => { if (token) void refresh().catch((e: Error) => setError(e.message)); }, [token, refresh]);
  async function action(fn: () => Promise<void>) {
    setError(''); setNotice(''); setBusy(true);
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : 'خطای ناشناخته'); } finally { setBusy(false); }
  }
  function json(value: object) { return JSON.stringify(value); }
  function input(form: HTMLFormElement) { return new FormData(form); }
  async function authenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = input(event.currentTarget);
    await action(async () => {
      const body = { email: String(data.get('email')), password: String(data.get('password')), ...(register ? { shopName: String(data.get('shopName')) } : {}) };
      const result = await request<{ accessToken: string }>(register ? '/auth/register' : '/auth/login', { method: 'POST', body: json(body) }, '');
      setToken(result.accessToken);
    });
  }
  async function addProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = input(form);
    await action(async () => { await request('/products', { method: 'POST', body: json({ title: String(data.get('title')) }) }); form.reset(); await refresh(); setNotice('محصول ایجاد شد؛ اکنون واریانت آن را اضافه کنید.'); });
  }
  async function addVariant(event: FormEvent<HTMLFormElement>, productId: string) {
    event.preventDefault(); const form = event.currentTarget; const data = input(form);
    await action(async () => { await request(`/products/${productId}/variants`, { method: 'POST', body: json({ price: Number(data.get('price')), stock: Number(data.get('stock')), size: String(data.get('size')), color: String(data.get('color')) }) }); form.reset(); await refresh(); setNotice('واریانت اضافه شد.'); });
  }
  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = input(event.currentTarget);
    await action(async () => { await request('/shop', { method: 'PATCH', body: json(Object.fromEntries(data.entries())) }); await refresh(); setNotice('تنظیمات ذخیره شد.'); });
  }
  async function previewReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = input(event.currentTarget);
    await action(async () => { setPreview(await request<{kind: string; text: string}>('/bot/preview', { method: 'POST', body: json({ message: String(data.get('message')) }) })); });
  }
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = input(form);
    await action(async () => { const result = await request<ImportResult>('/catalog/import', { method: 'POST', body: data }); setReport(result); await refresh(); setNotice('پردازش فایل انجام شد.'); });
  }
  return <main className="shell">
    <header><div><span className="eyebrow">دستیار فروش فارسی</span><h1>فروش‌یار</h1></div>{token && <button className="secondary" onClick={() => { setToken(''); setProducts([]); setShop(null); setReport(null); setPreview(null); }}>خروج</button>}</header>
    {!apiBase && <p role="alert" className="error">متغیر NEXT_PUBLIC_API_BASE_URL برای فرانت تنظیم نشده است.</p>}
    {error && <p role="alert" className="error">{error}</p>}{notice && <p role="status" className="success">{notice}</p>}
    {!token ? <section className="card auth"><h2>{register ? 'ساخت فروشگاه' : 'ورود به فروشگاه'}</h2><p>مدیریت کاتالوگ و موجودی در یک جا</p><form onSubmit={authenticate}>
      {register && <label>نام فروشگاه<input name="shopName" required maxLength={200} /></label>}
      <label>ایمیل<input name="email" type="email" required autoComplete="username" dir="ltr" /></label>
      <label>رمز عبور<input name="password" type="password" minLength={10} maxLength={128} required autoComplete={register ? 'new-password' : 'current-password'} dir="ltr" /></label>
      <button disabled={busy}>{register ? 'ثبت‌نام' : 'ورود'}</button></form><button type="button" className="link" onClick={() => setRegister(!register)}>{register ? 'حساب دارید؟ وارد شوید' : 'حساب ندارید؟ ثبت‌نام کنید'}</button></section>
      : <><section className="card"><h2>محصولات {shop && `«${shop.name}»`}</h2><p>قیمت‌ها به تومان هستند. موجودی هنگام فروش از پایگاه داده کم می‌شود.</p>
        <form className="row" onSubmit={addProduct}><label>نام محصول<input name="title" required maxLength={200} /></label><button disabled={busy}>افزودن محصول</button></form>
        {products.length === 0 && <p>هنوز محصولی ثبت نشده است.</p>}
        <div className="products">{products.map(product => <article className="product" key={product.id}><div className="productHead"><h3>{product.title}</h3><span>{product.active ? 'فعال' : 'غیرفعال'}</span></div>
          {product.variants.map(variant => <div className="variant" key={variant.id}><div><strong>{variant.color || 'بدون رنگ'} · {variant.size || 'بدون سایز'}</strong><p>{faNumber(variant.price)} تومان · موجودی {faNumber(variant.stock)}</p></div><button disabled={busy || variant.stock === 0} onClick={() => void action(async () => { await request(`/variants/${variant.id}/sell`, { method: 'POST', body: json({ quantity: 1 }) }); await refresh(); setNotice('فروش ثبت شد.'); })}>فروخته شد</button></div>)}
          <details><summary>افزودن واریانت</summary><form className="grid" onSubmit={event => void addVariant(event, product.id)}><label>قیمت (تومان)<input name="price" type="number" min="0" max="2147483647" required /></label><label>موجودی<input name="stock" type="number" min="0" max="2147483647" required /></label><label>سایز<input name="size" /></label><label>رنگ<input name="color" /></label><button disabled={busy}>ثبت واریانت</button></form></details>
        </article>)}</div></section>
        <section className="card"><h2>ورود کاتالوگ</h2><p>فایل CSV یا Excel را طبق نمونه آماده کنید؛ هر ردیف یک محصول جدید می‌سازد.</p><form className="row" onSubmit={upload}><label>فایل<input type="file" name="file" accept=".csv,.xlsx" required /></label><button disabled={busy}>بارگذاری</button></form>{report && <div><p>موفق: {faNumber(report.imported)} · ناموفق: {faNumber(report.failed)}</p>{report.results.filter(row => row.errors?.length).map(row => <p key={row.row}>ردیف {faNumber(row.row)}: {row.errors?.some(item => item.includes('SKU')) ? 'شناسهٔ کالا تکراری است.' : row.errors?.some(item => item.includes('Formula')) ? 'فرمول یا مقدار پشتیبانی‌نشده در فایل وجود دارد.' : 'نام، قیمت یا موجودی را بررسی کنید.'}</p>)}</div>}</section>
        <section className="card"><h2>پیش‌نمایش پاسخ</h2><p>این فقط یک آزمایش است؛ پیامی ارسال یا ارجاعی ثبت نمی‌شود.</p><form className="row" onSubmit={previewReply}><label>پیام مشتری<input name="message" maxLength={2000} required /></label><button disabled={busy}>مشاهده پاسخ</button></form>{preview && <div className="preview"><strong>{preview.kind === 'handoff' ? 'نیازمند پاسخ فروشنده' : preview.kind === 'clarify' ? 'نیازمند توضیح بیشتر' : 'پاسخ پیشنهادی'}</strong><p>{preview.text}</p></div>}</section>
        {shop && <section className="card"><h2>تنظیمات فروشگاه</h2><form className="grid" onSubmit={saveSettings}>{([['name','نام فروشگاه'],['tone','لحن'],['shipping','ارسال'],['payment','پرداخت'],['workingHours','ساعات کاری'],['handoffMessage','پیام ارجاع']] as const).map(([field, label]) => <label key={field}>{label}<input name={field} defaultValue={shop[field]} required={field === 'name'} maxLength={field === 'name' ? 200 : 2000} /></label>)}<button disabled={busy}>ذخیره تنظیمات</button></form></section>}
      </>}
    <footer>بخش گفتگو و پاسخ‌گوی خودکار هنوز آماده نیست.</footer>
  </main>;
}
