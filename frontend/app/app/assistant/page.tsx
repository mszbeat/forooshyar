'use client';

import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { api, ApiError, type AiStatus, type BotReply } from '@/lib/api';
import { faNum } from '@/lib/format';
import { PageHeader, Spinner, useToast } from '@/components/ui';
import { RichText } from '@/components/richtext';
import { IconAlertCircle, IconChat, IconSend, IconSettings, IconShield, IconSparkles } from '@/components/icons';

type Message = { id: number; role: 'customer' | 'bot'; text: string; kind?: BotReply['kind']; source?: 'rules' | 'ai' };

const SUGGESTIONS = [
  'سلام',
  'تایم کاریتون چنده؟',
  'قیمت مانتو کتان چنده؟',
  'هزینه ارسال چقدره؟',
  'می‌خوام مرجوع کنم',
  'بلابلا زیرو',
];

const ASSISTANT_VISUALS = [
  { src: '/assistant/mascot.png', title: 'دستیار فروش', detail: 'همراه هوشمند فروشگاه' },
  { src: '/assistant/orders.png', title: 'مدیریت سفارش', detail: 'پیگیری سفارش تا ارسال' },
  { src: '/assistant/inventory.webp', title: 'کنترل موجودی', detail: 'بررسی دقیق کاتالوگ' },
  { src: '/assistant/customer-chat.webp', title: 'پاسخ‌گویی به مشتری', detail: 'گفت‌وگوی سریع و دقیق' },
  { src: '/assistant/insights.webp', title: 'تحلیل فروش', detail: 'دید بهتر نسبت به روند فروش' },
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
  const [ai, setAi] = useState<AiStatus | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const counter = useRef(0);

  useEffect(() => {
    api.products()
      .then(list => setStats({
        products: list.filter(product => product.active).length,
        variants: list.flatMap(product => product.variants).filter(variant => variant.active).length,
      }))
      .catch(() => { /* the panel still works without the counter */ });
    api.botAi().then(setAi).catch(() => setAi(null));
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
      setMessages(previous => [...previous, { id: id + 1000, role: 'bot', text: reply.text, kind: reply.kind, source: reply.source }]);
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
        eyebrow="آزمایشگاه"
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
            <div className="row" style={{ gap: 8 }}>
              {ai && (
                <span
                  className={`badge ${ai.ready ? 'b-green' : 'b-gray'}`}
                  title={ai.ready ? `پاسخ‌های نامفهوم را ${ai.model} کامل می‌کند` : 'بات فقط با موتور قاعده‌محور و کاتالوگ جواب می‌دهد.'}
                >
                  <span className="dot" />
                  {ai.ready ? `هوش مصنوعی: ${ai.model}` : 'هوش مصنوعی: خاموش'}
                </span>
              )}
              <span className="badge b-brand"><span className="dot" />آزمایشی</span>
            </div>
          </div>

          <div className="chat" ref={scroller}>
            {messages.map(message => (
              <div key={message.id} className={`bubble ${message.role === 'customer' ? 'bubble-out' : 'bubble-in'}`}>
                {message.role === 'bot' && message.kind && (
                  <div style={{ marginBottom: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <span className={`badge ${KIND_LABEL[message.kind].tone}`}>{KIND_LABEL[message.kind].text}</span>
                    {message.source === 'ai' && <span className="badge b-blue">پاسخ مدل زبانی</span>}
                  </div>
                )}
                {message.role === 'bot' ? <RichText text={message.text} /> : <div>{message.text}</div>}
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

          <div className="card-foot" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <span className="small muted" style={{ marginInlineEnd: 4 }}>نمونه سؤال:</span>
            {SUGGESTIONS.map(suggestion => (
              <button
                key={suggestion} type="button" className="chip-btn"
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
              <span className="stat-ico"><IconShield size={15} /></span>
              <span className="card-title" style={{ margin: 0 }}>دستیار چطور تصمیم می‌گیرد؟</span>
            </div>
            <ul className="steps-plain">
              <li><span className="n num">۱</span><span>متن نرمال‌سازی می‌شود (ی/ک عربی، اعداد، نیم‌فاصله) و معادل محاوره‌ای جایگزین می‌شود — «تایم» = «ساعت»، «تومن» = «تومان».</span></li>
              <li><span className="n num">۲</span><span>مفهوم جمله تشخیص داده می‌شود، نه کلمه‌ی دقیق: «قیمتش چنده»، «چند میشه»، «نرخش» همه یعنی قیمت.</span></li>
              <li><span className="n num">۳</span><span>اگر یک پیام چند موضوع داشت، به همه جواب می‌دهد («قیمتش چنده و چند روزه می‌رسه؟»).</span></li>
              <li><span className="n num">۴</span><span>محصول را از کاتالوگ پیدا می‌کند؛ اگر چند نامزد بود، دکمه‌ی انتخاب نشان می‌دهد.</span></li>
              <li><span className="n num">۵</span><span>اگر نفهمید، با دکمه‌های «قیمت»، «ارسال»، «پرداخت»، «ساعت کاری» می‌پرسد. فقط اگر بعد از ۳ بار هم روشن نشد، به شما ارجاع می‌دهد.</span></li>
            </ul>
            <div className="alert alert-warn mt-4">
              <IconAlertCircle />
              <span>هیچ عددی ساخته نمی‌شود؛ قیمت و موجودی فقط از دیتابیس خوانده می‌شود.</span>
            </div>
          </section>

          <section className="card card-pad">
            <div className="row" style={{ gap: 10, marginBottom: 8 }}>
              <span className="stat-ico"><IconSparkles size={15} /></span>
              <span className="card-title" style={{ margin: 0 }}>برای پاسخ‌های بهتر</span>
            </div>
            <p className="small muted" style={{ lineHeight: 1.95 }}>
              نام محصولات را همان‌طور بنویسید که مشتری می‌نویسد. شرایط ارسال، پرداخت، ساعت کاری و
              <b> سیاست مرجوعی </b>
              را در تنظیمات کامل کنید تا دستیار همان‌جا جواب بدهد و مجبور نشود به شما ارجاع دهد.
            </p>
            <div className="row mt-3">
              <Link href="/app/settings" className="btn btn-soft btn-sm">تکمیل تنظیمات</Link>
              <Link href="/app/products" className="btn btn-ghost btn-sm">مشاهده کاتالوگ</Link>
            </div>
            <div className="small muted mt-3">محصولات فعال کاتالوگ شما ({faNum(stats.products)} محصول · {faNum(stats.variants)} واریانت) همین حالا در پاسخ‌ها استفاده می‌شوند.</div>
          </section>
        </div>
      </div>

      <section className="card assistant-visuals" aria-labelledby="assistant-visuals-title">
        <div className="card-head">
          <div>
            <div className="card-title" id="assistant-visuals-title">همراه هوشمند فروشگاه شما</div>
            <div className="card-desc">یک دستیار ثابت در مسیر سفارش، موجودی، گفت‌وگو و رشد فروش.</div>
          </div>
        </div>
        <div className="assistant-visual-grid">
          {ASSISTANT_VISUALS.map(item => (
            <article className="assistant-visual-card" key={item.src}>
              <div className="assistant-visual-image">
                <Image src={item.src} alt={`${item.title} — ربات دستیار فروش‌یار`} width={480} height={480} />
              </div>
              <div className="assistant-visual-copy">
                <strong>{item.title}</strong>
                <span>{item.detail}</span>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
