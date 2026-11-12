'use client';

import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';
import { api, ApiError, type AiStatus, type BotReply, type KnowledgeItem, type PromptState, type PromptTab } from '@/lib/api';
import { faNum } from '@/lib/format';
import { Field, Modal, PageHeader, SkeletonBlock, Spinner, Switch, useToast } from '@/components/ui';
import { RichText } from '@/components/richtext';
import { IconAlertCircle, IconChat, IconCheckCircle, IconSend, IconSettings, IconShield, IconSparkles } from '@/components/icons';

type Message = { id: number; role: 'customer' | 'bot'; text: string; kind?: BotReply['kind']; source?: 'rules' | 'ai' };

const SUGGESTIONS = [
  'سلام',
  'تایم کاریتون چنده؟',
  'قیمت مانتو کتان چنده؟',
  'هزینه ارسال چقدره؟',
  'می‌خوام مرجوع کنم',
  'بلابلا زیرو',
];

const KIND_LABEL: Record<BotReply['kind'], { text: string; tone: string }> = {
  answer: { text: 'پاسخ مستقیم', tone: 'b-green' },
  clarify: { text: 'نیاز به توضیح بیشتر', tone: 'b-amber' },
  handoff: { text: 'ارجاع به فروشنده', tone: 'b-blue' },
};

type MainTab = 'chat' | 'knowledge' | 'prompts' | 'answering';

export default function AssistantPage() {
  const toast = useToast();
  const [mainTab, setMainTab] = useState<MainTab>('chat');
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
        actions={<button type="button" className="btn btn-outline" onClick={() => setMainTab('answering')}><IconSettings size={16} />اطلاعات پاسخگویی</button>}
      />

      <div className="chip-tabs" role="group" aria-label="بخش‌های دستیار" style={{ marginBottom: 4 }}>
        <button type="button" className={`chip-btn ${mainTab === 'chat' ? 'on' : ''}`} onClick={() => setMainTab('chat')}>
          چت آزمایشی
        </button>
        <button type="button" className={`chip-btn ${mainTab === 'knowledge' ? 'on' : ''}`} onClick={() => setMainTab('knowledge')}>
          دانش (پرسش‌وپاسخ)
        </button>
        <button type="button" className={`chip-btn ${mainTab === 'prompts' ? 'on' : ''}`} onClick={() => setMainTab('prompts')}>
          پرامپت‌های دستیار
        </button>
        <button type="button" className={`chip-btn ${mainTab === 'answering' ? 'on' : ''}`} onClick={() => setMainTab('answering')}>
          اطلاعات پاسخگویی
        </button>
      </div>

      {mainTab === 'knowledge' && <KnowledgeSection />}
      {mainTab === 'prompts' && <PromptsSection />}
      {mainTab === 'answering' && <AnsweringSection />}

      {mainTab === 'chat' && (
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
              <button type="button" className="btn btn-soft btn-sm" onClick={() => setMainTab('answering')}>تکمیل اطلاعات پاسخگویی</button>
              <Link href="/app/products" className="btn btn-ghost btn-sm">مشاهده کاتالوگ</Link>
            </div>
            <div className="small muted mt-3">محصولات فعال کاتالوگ شما ({faNum(stats.products)} محصول · {faNum(stats.variants)} واریانت) همین حالا در پاسخ‌ها استفاده می‌شوند.</div>
          </section>
        </div>
      </div>
      )}

    </div>
  );
}

/* ------------------------------------------------------------ knowledge */

function KnowledgeSection() {
  const toast = useToast();
  const [items, setItems] = useState<KnowledgeItem[] | null>(null);
  const [editing, setEditing] = useState<KnowledgeItem | 'new' | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => {
    api.knowledge().then(setItems).catch(() => setItems([]));
  };

  useEffect(load, []);

  async function toggle(item: KnowledgeItem, active: boolean) {
    setBusy(true);
    try {
      await api.updateKnowledge(item.id, { active });
      toast.success(active ? 'مورد فعال شد.' : 'مورد غیرفعال شد.');
      load();
    } catch (problem) {
      toast.error('تغییر وضعیت انجام نشد', problem instanceof ApiError ? problem.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  async function remove(item: KnowledgeItem) {
    setBusy(true);
    try {
      await api.deleteKnowledge(item.id);
      toast.success('مورد دانش حذف شد.');
      load();
    } catch (problem) {
      toast.error('حذف انجام نشد', problem instanceof ApiError ? problem.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <div className="card-head">
        <div>
          <div className="card-title">دانش فروشگاه</div>
          <div className="card-desc">پرسش‌وپاسخ‌هایی که دستیار از روی آن‌ها جواب می‌دهد. محصولات و خدمات از کاتالوگ می‌آیند؛ این‌جا برای سؤال‌های پرتکرار است.</div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setEditing('new')}>+ پرسش جدید</button>
      </div>
      <div className="card-body" style={{ display: 'grid', gap: 10 }}>
        {items === null && <SkeletonBlock height={60} />}
        {items !== null && items.length === 0 && (
          <div className="alert alert-info">
            <IconAlertCircle />
            <span>هنوز پرسش‌وپاسخی ثبت نشده. سؤال‌هایی مثل «مرجوعی دارید؟» یا «کد تخفیف دارید؟» را این‌جا بنویسید تا دستیار خودش جواب بدهد.</span>
          </div>
        )}
        {items?.map(item => (
          <div key={item.id} className="row-between" style={{ border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px' }}>
            <div style={{ minWidth: 0 }}>
              <div className="strong" style={{ fontSize: 'var(--fs-sm)' }}>{item.question}</div>
              <div className="small muted" style={{ whiteSpace: 'pre-wrap' }}>{item.answer}</div>
              {item.keywords && <div className="small muted">کلیدها: {item.keywords}</div>}
            </div>
            <div className="row" style={{ gap: 6, flex: '0 0 auto' }}>
              <Switch label="فعال" checked={item.active} onChange={next => void toggle(item, next)} />
              <button className="btn btn-outline btn-sm" disabled={busy} onClick={() => setEditing(item)}>ویرایش</button>
              <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void remove(item)} style={{ color: 'var(--danger)' }}>حذف</button>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <KnowledgeModal
          item={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </section>
  );
}

function KnowledgeModal({ item, onClose, onSaved }: { item: KnowledgeItem | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const body = {
      question: String(data.get('question') ?? '').trim(),
      answer: String(data.get('answer') ?? '').trim(),
      keywords: String(data.get('keywords') ?? '').trim(),
    };
    setBusy(true);
    try {
      if (item) {
        await api.updateKnowledge(item.id, body);
        toast.success('پرسش‌وپاسخ به‌روزرسانی شد.');
      } else {
        await api.createKnowledge(body);
        toast.success('پرسش‌وپاسخ اضافه شد.');
      }
      onSaved();
    } catch (problem) {
      toast.error('ذخیره انجام نشد', problem instanceof ApiError ? problem.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open onClose={onClose} title={item ? 'ویرایش پرسش‌وپاسخ' : 'پرسش‌وپاسخ جدید'}
      description="جواب باید دقیق و کامل باشد؛ دستیار همین متن را به مشتری می‌دهد."
      footer={<><button className="btn btn-ghost" onClick={onClose}>انصراف</button><button className="btn btn-primary" form="kn-form" disabled={busy}>{busy && <Spinner size={14} />}ذخیره</button></>}
    >
      <form id="kn-form" onSubmit={submit} style={{ display: 'grid', gap: 14 }}>
        <Field label="سؤال" required htmlFor="kn-q">
          <input id="kn-q" name="question" className="input" required maxLength={500} defaultValue={item?.question ?? ''} placeholder="مرجوعی دارید؟" autoFocus />
        </Field>
        <Field label="جواب" required htmlFor="kn-a">
          <textarea id="kn-a" name="answer" className="textarea" required maxLength={4000} defaultValue={item?.answer ?? ''} placeholder="بله؛ تا ۷ روز پس از دریافت، اگر برچسب نخورده باشد…" />
        </Field>
        <Field label="کلمات کلیدی (اختیاری)" htmlFor="kn-k" hint="با کاما جدا کنید؛ برای تطبیق بهتر سؤال‌های مشابه.">
          <input id="kn-k" name="keywords" className="input" maxLength={500} defaultValue={item?.keywords ?? ''} placeholder="مرجوعی، تعویض، پس‌دادن" />
        </Field>
      </form>
    </Modal>
  );
}

/* ------------------------------------------------------------ prompts */

const PROMPT_TABS: { value: PromptTab; label: string; hint: string }[] = [
  { value: 'role', label: 'نقش و شخصیت', hint: 'دستیار کیست و چه کاری می‌کند.' },
  { value: 'tone', label: 'لحن پاسخگویی', hint: 'چطور حرف می‌زند؛ هرگز قیمت و موجودی را عوض نمی‌کند.' },
  { value: 'flow', label: 'روند اصلی', hint: 'قدم‌های پاسخ‌گویی و شروع سفارش.' },
];

function PromptsSection() {
  const toast = useToast();
  const [prompts, setPrompts] = useState<Record<PromptTab, PromptState> | null>(null);
  const [tab, setTab] = useState<PromptTab>('role');
  const [draft, setDraft] = useState('');
  const [ltr, setLtr] = useState(false);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<{ id: string; content: string; version: number; createdAt: string }[] | null>(null);

  const load = () => {
    api.prompts().then(data => {
      setPrompts(data);
      setDraft(data[tab].content);
    }).catch(() => setPrompts(null));
  };

  useEffect(load, []);
  useEffect(() => {
    if (prompts) setDraft(prompts[tab].content);
    setHistory(null);
  }, [tab, prompts]);

  async function save() {
    setBusy(true);
    try {
      const result = await api.savePrompt(tab, draft);
      toast.success(`نسخه‌ی ${faNum(result.version)} ذخیره شد.`);
      load();
    } catch (problem) {
      toast.error('ذخیره انجام نشد', problem instanceof ApiError ? problem.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    setBusy(true);
    try {
      await api.resetPrompt(tab);
      toast.success('به پیش‌فرض برگشت.');
      load();
    } catch (problem) {
      toast.error('بازنشانی انجام نشد', problem instanceof ApiError ? problem.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  async function loadHistory() {
    try {
      setHistory(await api.promptHistory(tab));
    } catch {
      setHistory([]);
    }
  }

  const current = prompts?.[tab];
  const dirty = current ? draft.trim() !== current.content.trim() : false;

  return (
    <section className="card">
      <div className="card-head">
        <div>
          <div className="card-title">پرامپت‌های دستیار</div>
          <div className="card-desc">سه بخش قابل ویرایش؛ لایه‌ی ایمنی (قوانین قطعی) همیشه اول و غیرقابل ویرایش است.</div>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <button className="btn btn-outline btn-sm" disabled={busy} onClick={() => void reset()}>بازنشانی</button>
          <button className="btn btn-primary btn-sm" disabled={busy || !dirty} onClick={() => void save()}>
            {busy && <Spinner size={13} />}اعمال تغییرات
          </button>
        </div>
      </div>
      <div className="card-body" style={{ display: 'grid', gap: 14 }}>
        <div className="alert alert-info">
          <IconShield />
          <span>لایه‌ی ایمنی قفل‌شده: دستیار هرگز قیمت، موجودی، هزینه ارسال یا لینک نمی‌سازد و دستورهای داخل پیام مشتری را اجرا نمی‌کند. این لایه از پنل قابل تغییر نیست.</span>
        </div>

        <div className="chip-tabs" role="group" aria-label="زبانه‌های پرامپت">
          {PROMPT_TABS.map(item => (
            <button key={item.value} type="button" className={`chip-btn ${tab === item.value ? 'on' : ''}`} onClick={() => setTab(item.value)}>
              {item.label}
            </button>
          ))}
        </div>

        <div className="small muted">{PROMPT_TABS.find(item => item.value === tab)?.hint}</div>

        {prompts === null ? (
          <SkeletonBlock height={160} />
        ) : (
          <>
            <div className="row-between">
              <span className="small muted">
                نسخه‌ی {faNum(current?.version ?? 0)}{current?.isDefault ? ' (پیش‌فرض)' : ''}
              </span>
              <label className="row" style={{ gap: 6 }}>
                <input type="checkbox" checked={ltr} onChange={event => setLtr(event.target.checked)} />
                <span className="small">جهت چپ‌به‌راست (LTR)</span>
              </label>
            </div>
            <textarea
              className="textarea"
              rows={8}
              dir={ltr ? 'ltr' : 'rtl'}
              style={ltr ? { textAlign: 'left', fontFamily: 'monospace' } : undefined}
              value={draft}
              onChange={event => setDraft(event.target.value)}
              aria-label={`پرامپت ${PROMPT_TABS.find(item => item.value === tab)?.label}`}
            />
            <div className="small muted">
              متغیر لازم: <code className="mono">{'{shop_name}'}</code> — نام فروشگاه به‌صورت خودکار جایگزین می‌شود.
            </div>

            <div style={{ borderTop: '1px solid var(--line)', paddingTop: 12 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => void loadHistory()}>
                تاریخچه‌ی نسخه‌ها
              </button>
              {history && (
                <div className="stack" style={{ gap: 6, marginTop: 8 }}>
                  {history.length === 0 && <span className="small muted">هنوز نسخه‌ای ذخیره نشده.</span>}
                  {history.map(version => (
                    <div key={version.id} className="row-between" style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '8px 10px' }}>
                      <span className="small">نسخه‌ی {faNum(version.version)}</span>
                      <button
                        className="btn btn-outline btn-sm"
                        onClick={() => setDraft(version.content)}
                      >
                        بازگردانی این نسخه
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ answering info */

/** پیش‌فرض‌های لحن — با یک کلیک در کادر لحن می‌نشینند؛ متن آزاد هم ممکن است. */
const TONE_PRESETS = [
  { label: 'صمیمی و دوستانه', value: 'صمیمی، گرم و مؤدبانه؛ مثل یک فروشنده‌ی آشنا. کوتاه و بدون اغراق.' },
  { label: 'رسمی و حرفه‌ای', value: 'رسمی، مؤدبانه و دقیق؛ بدون ایموجی و بدون خودمانی‌شدن.' },
  { label: 'پرانرژی و مشتاقانه', value: 'پرانرژی و مشتاقانه؛ مشتری را به خرید تشویق می‌کند ولی قیمت و موجودی را عوض نمی‌کند.' },
  { label: 'مینیمال و مستقیم', value: 'خیلی کوتاه و مستقیم؛ فقط اطلاعات، بدون مقدمه و تشریفات.' },
];

/**
 * اطلاعات پاسخگویی — لحن، شرایط ارسال، توضیح پرداخت، ساعت کاری، سیاست
 * مرجوعی و پیام ارجاع. این‌ها همان متن‌هایی است که دستیار وقتی سؤال را
 * می‌فهمد از آن‌ها استفاده می‌کند؛ خالی باشند، به فروشنده ارجاع می‌دهد.
 *
 * لایه‌ی ایمنی (قیمت/موجودی/جمع از دیتابیس) قفل است و این‌جا ویرایش نمی‌شود.
 */
function AnsweringSection() {
  const toast = useToast();
  const [form, setForm] = useState({ tone: '', shipping: '', payment: '', workingHours: '', returns: '', handoffMessage: '' });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.shop()
      .then(data => setForm({ tone: data.tone, shipping: data.shipping, payment: data.payment, workingHours: data.workingHours, returns: data.returns ?? '', handoffMessage: data.handoffMessage }))
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  const set = (key: keyof typeof form) => (event: { target: { value: string } }) =>
    setForm(previous => ({ ...previous, [key]: event.target.value }));

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      await api.updateShop(form);
      toast.success('اطلاعات پاسخگویی ذخیره شد.', 'پاسخ‌های دستیار از این پس با همین اطلاعات ساخته می‌شوند.');
    } catch (problem) {
      toast.error('ذخیره انجام نشد', problem instanceof ApiError ? problem.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <SkeletonBlock height={320} />;

  return (
    <form className="card" onSubmit={save}>
      <div className="card-head">
        <div className="row" style={{ gap: 10 }}>
          <span className="stat-ico"><IconSettings size={15} /></span>
          <div>
            <div className="card-title">اطلاعات پاسخگویی</div>
            <div className="card-desc">اگر خالی بماند، دستیار برای این سؤال‌ها شما را ارجاع می‌دهد.</div>
          </div>
        </div>
      </div>
      <div className="card-body" style={{ display: 'grid', gap: 14 }}>
        <Field label="لحن پاسخ" htmlFor="tone" hint="لحن فقط نحوه‌ی گفتن را عوض می‌کند؛ قیمت و موجودی همیشه از کاتالوگ می‌آید و هرگز با لحن عوض نمی‌شود.">
          <input id="tone" className="input" maxLength={2000} value={form.tone} onChange={set('tone')} placeholder="صمیمی و مؤدبانه، بدون اغراق" />
        </Field>
        <div className="tone-presets" role="group" aria-label="پیش‌فرض‌های لحن">
          {TONE_PRESETS.map(preset => (
            <button
              key={preset.label}
              type="button"
              className={`chip-btn ${form.tone === preset.value ? 'on' : ''}`}
              aria-pressed={form.tone === preset.value}
              onClick={() => setForm(previous => ({ ...previous, tone: preset.value }))}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <Field label="شرایط ارسال" htmlFor="shipping" hint="هزینه، روش و زمان تحویل را بنویسید.">
          <textarea id="shipping" className="textarea" maxLength={2000} value={form.shipping} onChange={set('shipping')}
            placeholder="ارسال با پست پیشتاز ۴۵٬۰۰۰ تومان؛ سفارش بالای ۲ میلیون تومان رایگان." />
        </Field>
        <Field label="توضیح پرداخت (برای پاسخ دستیار)" htmlFor="payment" hint="متن آزاد برای پاسخ‌گویی دستیار. شماره کارت‌های واقعی را در «تنظیمات فروشگاه ← شماره کارت» ثبت کنید؛ پرداخت مشتری همیشه کارت‌به‌کارت است.">
          <textarea id="payment" className="textarea" maxLength={2000} value={form.payment} onChange={set('payment')}
            placeholder="پرداخت کارت‌به‌کارت است؛ بعد از واریز، عکس رسید را بفرستید." />
        </Field>
        <Field label="ساعت کاری" htmlFor="workingHours">
          <input id="workingHours" className="input" maxLength={2000} value={form.workingHours} onChange={set('workingHours')}
            placeholder="شنبه تا پنجشنبه، ۱۰ صبح تا ۸ شب." />
        </Field>
        <Field label="سیاست مرجوعی و تعویض" htmlFor="returns" hint="اگر پرش کنید، بات سؤال «مرجوعی دارید؟» را خودش جواب می‌دهد. خالی باشد، بعد از چند سؤال به شما ارجاع می‌دهد.">
          <textarea id="returns" className="textarea" maxLength={2000} value={form.returns} onChange={set('returns')}
            placeholder="مثال: تا ۷ روز پس از دریافت، اگر برچسب نخورده باشد، تعویض یا مرجوع می‌کنیم." />
        </Field>
        <Field label="پیام ارجاع به فروشنده" htmlFor="handoffMessage" hint="فقط وقتی ارسال می‌شود که بات بعد از چند سؤال هم منظور مشتری را نفهمیده باشد.">
          <textarea id="handoffMessage" className="textarea" maxLength={2000} value={form.handoffMessage} onChange={set('handoffMessage')} />
        </Field>
      </div>
      <div className="card-foot row-between">
        <span className="small muted">تغییرات پس از ذخیره، در پاسخ‌های آزمایشی و واقعی اعمال می‌شود.</span>
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? <Spinner size={15} /> : <IconCheckCircle size={16} />}
          ذخیره
        </button>
      </div>
    </form>
  );
}
