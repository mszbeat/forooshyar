'use client';

import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';
import { api, ApiError, type BotReply } from '@/lib/api';
import { faNum } from '@/lib/format';
import { PageHeader, Spinner, useToast } from '@/components/ui';
import { IconAlertCircle, IconChat, IconSend, IconSettings, IconShield, IconSparkles } from '@/components/icons';

type Message = { id: number; role: 'customer' | 'bot'; text: string; kind?: BotReply['kind'] };

const SUGGESTIONS = [
  'سلام',
  'قیمت مانتو کتان تابستانه چنده؟',
  'شال نخی موجوده؟',
  'ارسال چطوریه؟',
  'ساعت کاریتون چنده؟',
  'می‌خوام مرجوع کنم',
];

const KIND_LABEL: Record<BotReply['kind'], { text: string; tone: string }> = {
  answer: { text: 'پاسخ مستقیم', tone: 'b-green' },
  clarify: { text: 'نیاز به توضیح بیشتر', tone: 'b-amber' },
  handoff: { text: 'ارجاع به فروشنده', tone: 'b-blue' },
};

export default function AssistantPage() {
  const toast = useToast();
  const [messages, setMessages] = useState<Message[]>([
    { id: 0, role: 'bot', text: 'سلام! این یک محیط آزمایشی است. هر سؤالی مشتری ممکن است بپرسد را بنویسید تا پاسخ فروش‌یار را ببینید.', kind: 'answer' },
  ]);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [stats, setStats] = useState({ products: 0, variants: 0 });
  const scroller = useRef<HTMLDivElement>(null);
  const counter = useRef(0);

  useEffect(() => {
    api.products()
      .then(list => setStats({
        products: list.filter(product => product.active).length,
        variants: list.flatMap(product => product.variants).filter(variant => variant.active).length,
      }))
      .catch(() => { /* the panel still works without the counter */ });
  }, []);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  async function send(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const text = value.trim();
    if (!text || busy) return;
    const id = ++counter.current;
    setMessages(previous => [...previous, { id, role: 'customer', text }]);
    setValue('');
    setBusy(true);
    try {
      const reply = await api.botPreview(text);
      setMessages(previous => [...previous, { id: id + 1000, role: 'bot', text: reply.text, kind: reply.kind }]);
      window.localStorage.setItem('forooshyar.botTested', '1');
    } catch (problem) {
      const message = problem instanceof ApiError ? problem.message : 'ارتباط با سرور برقرار نشد.';
      setMessages(previous => [...previous, { id: id + 2000, role: 'bot', text: message, kind: 'handoff' }]);
      toast.error('دریافت پاسخ انجام نشد', message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <PageHeader
        title="دستیار پاسخ‌گو"
        description="همان منطق واقعی پاسخ‌گویی، اجراشده روی کاتالوگ فعلی شما — بدون ارسال پیام و بدون تغییر داده."
        actions={<Link href="/app/settings" className="btn btn-outline"><IconSettings size={16} />تنظیمات پاسخ</Link>}
      />

      <div className="split">
        <section className="card" style={{ overflow: 'hidden' }}>
          <div className="card-head">
            <div className="row" style={{ gap: 10 }}>
              <span className="avatar avatar-brand"><IconChat size={16} /></span>
              <div>
                <div className="card-title">گفتگوی آزمایشی</div>
                <div className="card-desc">مشتری فرضی · بدون کانال متصل</div>
              </div>
            </div>
            <span className="badge b-brand"><span className="dot" />آزمایشی</span>
          </div>

          <div className="chat" ref={scroller}>
            {messages.map(message => (
              <div key={message.id} className={`bubble ${message.role === 'customer' ? 'bubble-out' : 'bubble-in'}`}>
                {message.role === 'bot' && message.kind && (
                  <div style={{ marginBottom: 6 }}>
                    <span className={`badge ${KIND_LABEL[message.kind].tone}`}>{KIND_LABEL[message.kind].text}</span>
                  </div>
                )}
                <div>{message.text}</div>
              </div>
            ))}
            {busy && (
              <div className="bubble bubble-in" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <Spinner size={14} />
                <span className="small muted">در حال ساخت پاسخ از کاتالوگ…</span>
              </div>
            )}
          </div>

          <form onSubmit={send} style={{ display: 'flex', gap: 8, padding: 'var(--sp-4)', borderTop: '1px solid var(--line)', background: 'var(--surface-2)' }}>
            <input
              className="input" placeholder="پیام مشتری را بنویسید…" value={value} maxLength={2000}
              onChange={event => setValue(event.target.value)} aria-label="پیام آزمایشی"
            />
            <button className="btn btn-primary" disabled={busy || !value.trim()} type="submit" style={{ flex: '0 0 auto' }}>
              <IconSend size={16} />
              ارسال
            </button>
          </form>

          <div className="card-foot" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <span className="small muted" style={{ marginInlineEnd: 4 }}>نمونه سؤال:</span>
            {SUGGESTIONS.map(suggestion => (
              <button
                key={suggestion} type="button" className="badge b-gray"
                style={{ cursor: 'pointer', border: '1px solid var(--line)' }}
                onClick={() => setValue(suggestion)}
              >
                {suggestion}
              </button>
            ))}
          </div>
        </section>

        <div className="stack">
          <section className="card card-pad">
            <div className="row" style={{ gap: 10, marginBottom: 10 }}>
              <span className="stat-ico"><IconShield size={17} /></span>
              <strong>دستیار چطور تصمیم می‌گیرد؟</strong>
            </div>
            <ul style={{ display: 'grid', gap: 10, fontSize: 'var(--fs-sm)', color: 'var(--ink-2)' }}>
              <li>۱. متن فارسی نرمال‌سازی می‌شود (ی/ک عربی، اعداد، نیم‌فاصله).</li>
              <li>۲. قصد پیام تشخیص داده می‌شود: قیمت، موجودی، سایز، ارسال، پرداخت، ساعت کاری.</li>
              <li>۳. محصول دقیقاً از روی نام در کاتالوگ جست‌وجو می‌شود.</li>
              <li>۴. اگر بیش از یک محصول یا واریانت مطابق بود، سؤال شفاف‌ساز می‌پرسد.</li>
              <li>۵. اگر مطمئن نبود یا موضوع حساس بود (تخفیف، مرجوعی، شکایت)، به شما ارجاع می‌دهد.</li>
            </ul>
            <div className="alert alert-warn mt-4">
              <IconAlertCircle />
              <span>هیچ عددی ساخته نمی‌شود؛ قیمت و موجودی فقط از دیتابیس خوانده می‌شود.</span>
            </div>
          </section>

          <section className="card card-pad" style={{ background: 'linear-gradient(160deg, var(--brand-50), #fff 70%)', borderColor: 'var(--brand-100)' }}>
            <div className="row" style={{ gap: 10, marginBottom: 8 }}>
              <span className="stat-ico" style={{ background: '#fff' }}><IconSparkles size={17} /></span>
              <strong>برای پاسخ‌های بهتر</strong>
            </div>
            <p className="small muted" style={{ lineHeight: 1.95 }}>
              نام محصولات را همان‌طور بنویسید که مشتری می‌نویسد. شرایط ارسال، پرداخت و ساعت کاری را در تنظیمات کامل کنید تا
              دستیار بتواند بدون ارجاع پاسخ دهد.
            </p>
            <div className="row mt-3">
              <Link href="/app/settings" className="btn btn-soft btn-sm">تکمیل تنظیمات</Link>
              <Link href="/app/products" className="btn btn-ghost btn-sm">مشاهده کاتالوگ</Link>
            </div>
            <div className="small muted mt-3">محصولات فعال کاتالوگ شما ({faNum(stats.products)} محصول · {faNum(stats.variants)} واریانت) همین حالا در پاسخ‌ها استفاده می‌شوند.</div>
          </section>
        </div>
      </div>
    </div>
  );
}
