'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';
import {
  api, ApiError, type ConversationSummary, type ConversationThread, type ThreadMessage,
} from '@/lib/api';
import { useRealtime } from '@/lib/realtime';
import { faNum, relativeTime, toman } from '@/lib/format';
import { EmptyState, SkeletonBlock, Spinner, useToast } from '@/components/ui';
import { IconAlertCircle, IconChat, IconRefresh, IconSearch, IconSend } from '@/components/icons';

type Filter = 'all' | 'pending';

/**
 * گفت‌وگوها — چیدمان تمام‌صفحه مثل تلگرام/واتس‌اپ وب.
 *
 * بدون هدر بزرگ: فهرست گفتگوها (یا مشتریان) یک سمت و رشته‌ی پیام سمت
 * دیگر، هر دو تا ارتفاع کامل صفحه. مشتریان همین‌جا ادغام شده‌اند:
 * سوییچ بالای فهرست بین «گفتگوها» و «مشتریان» جابه‌جا می‌شود.
 */
export default function ConversationsPage() {
  const toast = useToast();
  const [items, setItems] = useState<ConversationSummary[]>([]);
  const [counts, setCounts] = useState({ all: 0, pending: 0, open: 0 });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const [active, setActive] = useState<string | null>(null);
  const [targetMsg, setTargetMsg] = useState<string | null>(null);
  const [thread, setThread] = useState<ConversationThread | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [takeoverBusy, setTakeoverBusy] = useState(false);
  const bottom = useRef<HTMLDivElement | null>(null);
  const targetRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.conversations();
      setItems(data.items);
      setCounts(data.counts);
      setLoadError(false);
      return data.items;
    } catch (problem) {
      setLoadError(true);
      toast.error('فهرست گفتگوها بارگذاری نشد', problem instanceof ApiError ? problem.message : undefined);
      return [];
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  /** انتخاب گفتگو + باز کردن از روی اعلان (پیوند عمیق). */
  const open = useCallback(async (chatId: string, messageId?: string | null) => {
    setActive(chatId);
    setTargetMsg(messageId ?? null);
    setThreadLoading(true);
    setThread(null);
    try {
      setThread(await api.conversation(chatId));
    } catch (problem) {
      toast.error('گفتگو باز نشد', problem instanceof ApiError ? problem.message : undefined);
    } finally {
      setThreadLoading(false);
    }
  }, [toast]);

  // پیوند عمیق: فقط یک بار در بارگذاری اولیه.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const chat = params.get('chat');
    if (chat) void open(chat, params.get('msg'));
  }, [open]);

  /**
   * به‌روزرسانی زنده: پیام تازه بدون رفرش همین‌جا می‌نشیند.
   */
  useRealtime(['chat'], event => {
    void load();
    const chatId = typeof event.data?.chatId === 'string' ? event.data.chatId : null;
    if (chatId && chatId === active) {
      void api.conversation(chatId).then(setThread).catch(() => undefined);
    }
  });

  // اسکرول: اگر پیام مشخصی خواسته شده، روی همان؛ وگرنه انتهای گفتگو.
  useEffect(() => {
    if (!thread) return;
    const node = targetMsg ? targetRef.current : bottom.current;
    node?.scrollIntoView({ block: targetMsg ? 'center' : 'end' });
  }, [thread, targetMsg]);

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!active || !draft.trim() || sending) return;
    setSending(true);
    try {
      const result = await api.replyConversation(active, draft.trim());
      if (!result.ok) {
        toast.error('پیام ارسال نشد', result.error);
        return;
      }
      setDraft('');
      setThread(current => current && result.message
        ? { ...current, messages: [...current.messages, result.message as ThreadMessage] }
        : current);
      void load();
    } catch (problem) {
      toast.error('پیام ارسال نشد', problem instanceof ApiError ? problem.message : undefined);
    } finally {
      setSending(false);
    }
  }

  async function toggleTakeover() {
    if (!active || !thread) return;
    const next = !thread.conversation.humanTakeover;
    setTakeoverBusy(true);
    try {
      await api.setTakeover(active, next);
      setThread(current => current
        ? { ...current, conversation: { ...current.conversation, humanTakeover: next } }
        : current);
      toast.success(next ? 'گفتگو را در دست گرفتید؛ بات دیگر خودکار جواب نمی‌دهد.' : 'گفتگو به بات برگشت.');
      void load();
    } catch (problem) {
      toast.error('تغییر وضعیت انجام نشد', problem instanceof ApiError ? problem.message : undefined);
    } finally {
      setTakeoverBusy(false);
    }
  }

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return items.filter(item => {
      if (filter === 'pending' && !item.pending) return false;
      if (!term) return true;
      return item.name.toLowerCase().includes(term)
        || (item.username ?? '').toLowerCase().includes(term)
        || (item.lastMessage?.text ?? '').toLowerCase().includes(term);
    });
  }, [items, query, filter]);


  return (
    <div className="conv-full">
      <div className={`conv-shell conv-full-shell ${active ? 'has-active' : ''}`}>
        {/* ------------------------------------------------------------ فهرست */}
        <div className="conv-list">
          <div className="conv-list-head">
            <div className="conv-list-title">گفتگوها ({faNum(counts.all)})</div>
            <div className="input-wrap">
              <IconSearch className="input-ico" size={15} />
              <input
                className="input input-sm" placeholder="جستجو…"
                value={query} onChange={event => setQuery(event.target.value)} aria-label="جستجو"
              />
            </div>
            <div className="chip-tabs" role="group" aria-label="فیلتر گفتگوها">
              <button type="button" className={`chip-btn ${filter === 'all' ? 'on' : ''}`} onClick={() => setFilter('all')}>
                همه {faNum(counts.all)}
              </button>
              <button type="button" className={`chip-btn ${filter === 'pending' ? 'on' : ''}`} onClick={() => setFilter('pending')}>
                <span className="dot" style={{ background: 'var(--amber)' }} />
                بی‌پاسخ {faNum(counts.pending)}
              </button>
            </div>
          </div>

          <div className="conv-list-body">
                {loading && [0, 1, 2, 3].map(index => <SkeletonBlock key={index} height={64} />)}
                {!loading && loadError && items.length === 0 && (
                  <div className="conv-empty" role="alert">
                    <IconAlertCircle size={22} />
                    <p>فهرست گفتگوها دریافت نشد.</p>
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => { setLoading(true); void load(); }}>
                      <IconRefresh size={14} /> تلاش دوباره
                    </button>
                  </div>
                )}
                {!loading && !loadError && visible.length === 0 && (
                  <div className="conv-empty">
                    <IconChat size={22} />
                    <p>
                      {items.length === 0
                        ? 'هنوز کسی به بات پیام نداده. لینک فروشگاه را در بیو اینستاگرام بگذارید تا اولین گفتگو همین‌جا سبز شود.'
                        : 'گفتگویی با این فیلتر نیست.'}
                    </p>
                  </div>
                )}
                {visible.map(item => (
                  <button
                    key={item.chatId}
                    type="button"
                    className={`conv-row ${active === item.chatId ? 'active' : ''} ${item.pending ? 'pending' : ''}`}
                    onClick={() => void open(item.chatId)}
                  >
                    <span className="avatar avatar-brand conv-av">{initials(item.name)}</span>
                    <span className="conv-row-main">
                      <span className="conv-row-top">
                        <span className="conv-name">{item.name}</span>
                        <span className="conv-time">{relativeTime(item.lastSeenAt)}</span>
                      </span>
                      <span className="conv-snippet">{item.lastMessage?.text ?? 'بدون پیام'}</span>
                      <span className="conv-tags">
                        <span className="badge b-gray">{item.platform === 'INSTAGRAM' ? 'اینستاگرام' : 'تلگرام'}</span>
                        {item.humanTakeover && <span className="badge b-blue">در دست فروشنده</span>}
                        {item.orders > 0 && <span className="badge b-gray">{faNum(item.orders)} سفارش</span>}
                        {item.spent > 0 && <span className="badge b-green">خریدار</span>}
                        {item.pending && <span className="badge b-amber"><span className="dot" />بی‌پاسخ</span>}
                      </span>
                    </span>
                  </button>
                ))}
          </div>
        </div>

        {/* ----------------------------------------------------------- رشته‌ی پیام */}
        <div className="conv-thread">
          {!active && (
            <div className="conv-thread-empty">
              <span className="conv-thread-ico"><IconChat size={22} /></span>
              <strong>برای شروع مکالمه، یک کاربر را انتخاب کنید</strong>
              <p>پیام‌های مشتری، سفارش‌هایش و کادر پاسخ — همه در یک ستون.</p>
            </div>
          )}

          {active && (
            <>
              <div className="conv-thread-head">
                <button type="button" className="btn btn-ghost btn-sm conv-back" onClick={() => setActive(null)}>
                  بازگشت به فهرست
                </button>
                <div className="conv-thread-id">
                  <strong>{thread?.conversation.name ?? 'گفتگو'}</strong>
                  <span className="small muted">
                    {thread?.conversation.username ? `@${thread.conversation.username} · ` : ''}
                    {thread ? `${faNum(thread.messages.length)} پیام` : 'در حال بارگذاری…'}
                    {thread?.conversation.lastReplySource ? ` · پاسخ AI (${thread.conversation.lastReplySource === 'llm' ? 'مدل' : 'قاعده‌محور'})` : ''}
                  </span>
                </div>
                {thread && (
                  <button
                    type="button"
                    className={`btn btn-sm ${thread.conversation.humanTakeover ? 'btn-primary' : 'btn-outline'}`}
                    disabled={takeoverBusy}
                    onClick={() => void toggleTakeover()}
                  >
                    {takeoverBusy ? <Spinner size={13} /> : null}
                    {thread.conversation.humanTakeover ? 'برگرداندن به بات' : 'در دست گرفتن'}
                  </button>
                )}
                {thread && thread.orders.length > 0 && (
                  <div className="conv-thread-orders">
                    {thread.orders.slice(0, 3).map(order => (
                      <Link key={order.id} href={`/app/orders?order=${order.id}`} className="badge b-gray">
                        {order.code} · {toman(order.total)}
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              <div className="conv-msgs">
                {threadLoading && (
                  <div className="conv-loading"><Spinner size={18} /><span className="small muted">بارگذاری پیام‌ها…</span></div>
                )}
                {thread?.messages.map(message => {
                  const author = message.author ?? (message.direction === 'in' ? 'customer' : 'bot');
                  const mine = author !== 'customer';
                  return (
                    <div
                      key={message.id}
                      ref={message.id === targetMsg ? targetRef : undefined}
                      className={`msg ${mine ? 'msg-out' : 'msg-in'} msg-${author} ${message.id === targetMsg ? 'msg-target' : ''}`}
                    >
                      <div className="msg-bubble">
                        {mine && (
                          <span className={`msg-author ${author === 'seller' ? 'is-seller' : 'is-bot'}`}>
                            {author === 'seller' ? 'فروشنده' : 'پاسخ خودکار'}
                          </span>
                        )}
                        <p>{message.text}</p>
                        <span className="msg-meta">
                          {relativeTime(message.at)}
                          {message.replyText && <em> · پاسخ به «{message.replyText.slice(0, 28)}…»</em>}
                        </span>
                      </div>
                    </div>
                  );
                })}
                {thread && thread.messages.length === 0 && (
                  <div className="conv-empty"><p>پیامی در این گفتگو ثبت نشده.</p></div>
                )}
                <div ref={bottom} />
              </div>

              <form className="conv-compose" onSubmit={send}>
                <textarea
                  className="textarea conv-input"
                  rows={2}
                  placeholder="پاسخ خود را بنویسید… (با همان بات برای مشتری می‌رود)"
                  value={draft}
                  maxLength={2000}
                  onChange={event => setDraft(event.target.value)}
                  onKeyDown={event => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      event.currentTarget.form?.requestSubmit();
                    }
                  }}
                />
                <button className="btn btn-primary" disabled={sending || !draft.trim()}>
                  {sending ? <Spinner size={14} /> : <IconSend size={15} />}
                  ارسال
                </button>
              </form>
            </>
          )}
        </div>
      </div>

      {!loading && items.length === 0 && !loadError && (
        <EmptyState
          icon={<IconChat />}
          title="گفتگویی شکل نگرفته"
          description="به‌محض اینکه مشتری در تلگرام به بات پیام بدهد، گفتگو با نام و متن آخرین پیام همین‌جا ظاهر می‌شود."
          action={<Link href="/app/accounts" className="btn btn-primary">اتصال اکانت</Link>}
        />
      )}
    </div>
  );
}

function initials(name: string) {
  const clean = name.replace(/^@/, '').trim();
  return clean.slice(0, 2).toUpperCase();
}
