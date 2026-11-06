'use client';

import { useRef, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import Link from 'next/link';
import { api, ApiError, type ImportResult } from '@/lib/api';
import { faNum } from '@/lib/format';
import { EmptyState, PageHeader, Spinner, useToast } from '@/components/ui';
import { IconAlertCircle, IconCheckCircle, IconDownload, IconFile, IconInfo, IconUpload, IconX } from '@/components/icons';

const SAMPLE_CSV = [
  'name,price,stock,size,color,sku',
  'مانتو کتان تابستانه,890000,12,M,کرم,MN-KTN-M-KRM',
  'مانتو کتان تابستانه,890000,3,L,مشکی,MN-KTN-L-MSH',
  'شال نخی طرح‌دار,450000,25,,فیروزه‌ای,SHL-NKH-FRZ',
].join('\n');

/** Turns the API's field-level errors into a short Persian explanation. */
function explainRow(errors: string[] | undefined): string {
  if (!errors || errors.length === 0) return 'ردیف نامعتبر است.';
  const joined = errors.join(' | ');
  if (/SKU/i.test(joined)) return 'کد کالا (SKU) تکراری است؛ برای هر واریانت یک کد یکتا وارد کنید.';
  if (/Formula|unsupported/i.test(joined)) return 'سلول فرمول یا مقدار پشتیبانی‌نشده دارد؛ مقدار را به عدد یا متن ساده تغییر دهید.';
  if (/title/i.test(joined) && /at most/i.test(joined)) return 'نام محصول بیش از ۲۰۰ کاراکتر است؛ آن را کوتاه کنید.';
  if (/title/i.test(joined)) return 'نام محصول خالی است؛ این ستون الزامی است.';
  if (/price/i.test(joined)) return 'قیمت باید عدد صحیح و بزرگ‌تر یا مساوی صفر باشد (بدون واحد، حرف یا علامت منفی).';
  if (/stock/i.test(joined)) return 'موجودی باید عدد صحیح و بزرگ‌تر یا مساوی صفر باشد (بدون اعشار).';
  return errors.join(' · ').slice(0, 160);
}

const COLUMNS = [
  { name: 'name', desc: 'نام محصول', required: true },
  { name: 'price', desc: 'قیمت به تومان (عدد صحیح)', required: true },
  { name: 'stock', desc: 'موجودی اولیه', required: true },
  { name: 'size', desc: 'سایز واریانت', required: false },
  { name: 'color', desc: 'رنگ واریانت', required: false },
  { name: 'sku', desc: 'کد کالا؛ باید یکتا باشد', required: false },
];

export default function ImportPage() {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<ImportResult | null>(null);
  const [error, setError] = useState('');

  function pick(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0];
    if (selected) accept(selected);
  }

  function accept(selected: File) {
    setError('');
    setReport(null);
    if (!/\.(csv|xlsx)$/i.test(selected.name)) {
      setError('فقط فایل CSV یا XLSX پشتیبانی می‌شود.');
      return;
    }
    if (selected.size > 2 * 1024 * 1024) {
      setError('حجم فایل باید کمتر از ۲ مگابایت باشد.');
      return;
    }
    setFile(selected);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    const dropped = event.dataTransfer.files?.[0];
    if (dropped) accept(dropped);
  }

  async function upload() {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const result = await api.importCatalog(file);
      setReport(result);
      if (result.failed === 0) toast.success('همه ردیف‌ها ثبت شد', `${faNum(result.imported)} محصول ساخته شد.`);
      else toast.push('info', 'پردازش با خطا تمام شد', `${faNum(result.imported)} موفق و ${faNum(result.failed)} ناموفق.`);
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.message : 'بارگذاری فایل انجام نشد.');
    } finally {
      setBusy(false);
    }
  }

  function downloadSample() {
    const blob = new Blob(['\uFEFF' + SAMPLE_CSV], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'forooshyar-catalog-sample.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const errorRows = report?.results.filter(row => row.errors?.length) ?? [];

  return (
    <div className="stack">
      <PageHeader
        title="ورود کاتالوگ از فایل"
        description="هر ردیف فایل به یک محصول با واریانت خودش تبدیل می‌شود. خطای هر ردیف جدا گزارش می‌شود."
        actions={<button className="btn btn-outline" onClick={downloadSample}><IconDownload size={16} />دانلود فایل نمونه</button>}
      />

      <div className="split">
        <section className="card">
          <div className="card-head">
            <div>
              <div className="card-title">انتخاب فایل</div>
              <div className="card-desc">CSV یا XLSX، حداکثر ۲ مگابایت</div>
            </div>
          </div>
          <div className="card-body stack" style={{ gap: 14 }}>
            <div
              className={`dropzone ${dragging ? 'drag' : ''}`}
              onClick={() => inputRef.current?.click()}
              onDragOver={event => { event.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              role="button"
              tabIndex={0}
              onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') inputRef.current?.click(); }}
            >
              <div className="empty-ico" style={{ width: 46, height: 46 }}>
                <IconUpload size={22} />
              </div>
              <div className="strong" style={{ fontSize: 'var(--fs-md)' }}>فایل را اینجا رها کنید یا کلیک کنید</div>
              <div className="small muted">فرمت‌های مجاز: .csv و .xlsx</div>
              <input ref={inputRef} type="file" accept=".csv,.xlsx" onChange={pick} hidden />
            </div>

            {file && (
              <div className="row-between" style={{ padding: '10px 14px', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', background: 'var(--surface-2)' }}>
                <div className="row" style={{ gap: 10 }}>
                  <span className="avatar avatar-brand"><IconFile size={15} /></span>
                  <div>
                    <div className="strong" style={{ fontSize: 'var(--fs-sm)' }}>{file.name}</div>
                    <div className="small muted">{faNum(Math.max(1, Math.round(file.size / 1024)))} کیلوبایت</div>
                  </div>
                </div>
                <button className="btn btn-ghost btn-icon btn-sm" onClick={() => { setFile(null); setReport(null); }} aria-label="حذف فایل">
                  <IconX size={15} />
                </button>
              </div>
            )}

            {error && <div className="alert alert-error"><IconAlertCircle /><span>{error}</span></div>}

            <div className="row">
              <button className="btn btn-primary" onClick={() => void upload()} disabled={!file || busy}>
                {busy ? <Spinner size={15} /> : <IconUpload size={16} />}
                {busy ? 'در حال پردازش…' : 'شروع بارگذاری'}
              </button>
              <Link href="/app/products" className="btn btn-ghost">رفتن به محصولات</Link>
            </div>
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <div>
              <div className="card-title">ساختار ستون‌ها</div>
              <div className="card-desc">نام ستون‌ها به لاتین باشد</div>
            </div>
          </div>
          <div className="list">
            {COLUMNS.map(column => (
              <div className="list-row" key={column.name} style={{ padding: '10px 20px' }}>
                <div className="list-main">
                  <div className="list-title mono">{column.name}</div>
                  <div className="list-sub">{column.desc}</div>
                </div>
                <span className={`badge ${column.required ? 'b-brand' : 'b-gray'}`}>{column.required ? 'الزامی' : 'اختیاری'}</span>
              </div>
            ))}
          </div>
          <div className="card-foot">
            <div className="alert alert-info" style={{ border: 0, background: 'transparent', padding: 0 }}>
              <IconInfo />
              <span>اگر ردیفی خطا داشته باشد، بقیه ردیف‌ها ثبت می‌شوند و فقط همان ردیف گزارش می‌شود.</span>
            </div>
          </div>
        </section>
      </div>

      {report && (
        <section className="card">
          <div className="card-head">
            <div>
              <div className="card-title">نتیجه پردازش</div>
              <div className="card-desc">گزارش دقیق هر ردیف فایل</div>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <span className="badge b-green"><IconCheckCircle size={13} />{faNum(report.imported)} موفق</span>
              <span className={`badge ${report.failed ? 'b-red' : 'b-gray'}`}><IconX size={13} />{faNum(report.failed)} ناموفق</span>
            </div>
          </div>

          {errorRows.length === 0 ? (
            <EmptyState
              icon={<IconCheckCircle />}
              title="همه ردیف‌ها با موفقیت ثبت شد"
              description="محصولات ساخته شدند و در فهرست محصولات قابل مشاهده هستند."
              action={<Link href="/app/products" className="btn btn-primary">مشاهده محصولات</Link>}
            />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr><th style={{ width: 90 }}>ردیف</th><th>وضعیت</th><th>توضیح خطا</th></tr>
                </thead>
                <tbody>
                  {errorRows.map(row => (
                    <tr key={row.row}>
                      <td className="td-num">{faNum(row.row)}</td>
                      <td><span className="badge b-red">ثبت نشد</span></td>
                      <td className="small">{explainRow(row.errors)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
