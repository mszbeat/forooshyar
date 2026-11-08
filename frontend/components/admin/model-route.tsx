'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { adminApi, AdminError, type AiProvider } from '@/lib/admin';
import { Spinner } from '@/components/ui';
import { IconAlertCircle, IconCheck, IconChevronDown, IconSearch, IconSparkles, IconX } from '@/components/icons';
import { splitProviderError } from './probe';

export type ModelRouteProps = {
  providers: AiProvider[];
  draft: Record<string, string>;
  set: (key: string, value: string) => void;
};

type ProbeFailure = {
  headline: string;
  detail: string;
  code: string;
  model: string;
  provider: string;
  latencyMs: number;
};

/**
 * «مسیر مدل» — انتخاب میزبان، انتخاب مدل و آزمون، در یک بلوک.
 *
 * چرا این‌طور طراحی شده:
 *  - **یک بازشوی جمع‌شو به‌جای چهار تب.** تب‌های کنار هم اول صفحه را شلوغ
 *    می‌کردند و دوم، انتخاب میزبان و مدل را از هم جدا می‌انداختند؛ حالا هر دو
 *    یک جریان‌اند: میزبان را انتخاب کن، مدل‌های همان میزبان را ببین.
 *  - **جست‌وجوی تایپی و فیلتر «فقط رایگان».** فهرست مدل‌های OpenRouter ده‌ها
 *    ردیف است؛ بدون فیلتر، انتخاب مدل رایگان عملاً حدس‌زدن بود.
 *  - **آزمون همان‌جا، با مقادیر ذخیره‌نشده.** ادمین نباید برای فهمیدن اینکه
 *    «این مدل درست است یا نه» اول ذخیره کند و بعد تست بگیرد؛ مقدارهای فعلی
 *    فرم مستقیم به سرور می‌روند و چیزی در دیتابیس نوشته نمی‌شود.
 *  - **خطا در مودال قرمز و پس از ۵ ثانیه ناپدید می‌شود.** پیام خام درگاه (JSON
 *    بلند) در خود کارت جا نمی‌شد و روی کارت‌های همسایه می‌افتاد.
 */
export function ModelRoute({ providers, draft, set }: ModelRouteProps) {
  const baseUrl = (draft.AI_BASE_URL ?? '').trim();
  const model = (draft.AI_MODEL ?? '').trim();

  const active = useMemo(
    () => providers.find(provider => !provider.custom && provider.baseUrl === baseUrl)
      ?? providers.find(provider => provider.custom)
      ?? null,
    [providers, baseUrl],
  );

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [freeOnly, setFreeOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState<{ latencyMs: number; sample: string } | null>(null);
  const [failure, setFailure] = useState<ProbeFailure | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // کلیک بیرون یا Escape، فهرست میزبان‌ها را می‌بندد.
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // مودال خطا بعد از ۵ ثانیه خودش می‌رود (و با Escape/کلیک هم بسته می‌شود).
  useEffect(() => {
    if (!failure) return;
    const timer = setTimeout(() => setFailure(null), 5000);
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setFailure(null); };
    document.addEventListener('keydown', onKey);
    return () => { clearTimeout(timer); document.removeEventListener('keydown', onKey); };
  }, [failure]);

  const models = active?.models ?? [];
  const needle = query.trim().toLowerCase();
  const visible = models.filter(item => {
    if (freeOnly && !item.free) return false;
    if (!needle) return true;
    return item.value.toLowerCase().includes(needle) || item.label.toLowerCase().includes(needle);
  });
  const exact = models.some(item => item.value === needle);
  const canUseTyped = needle.length > 2 && !exact;

  function chooseHost(provider: AiProvider) {
    setOpen(false);
    setQuery('');
    setSuccess(null);
    if (provider.custom) {
      // میزبان دستی: آدرس پاک می‌شود تا ادمین خودش بنویسد (اگر از قبل خالی نیست،
      // همان مقدار قبلی می‌ماند؛ عوض‌کردن ناگهانی آدرس گمراه‌کننده است).
      if (!draft.AI_BASE_URL) set('AI_BASE_URL', '');
      return;
    }
    set('AI_BASE_URL', provider.baseUrl);
    const first = provider.models.find(item => item.free) ?? provider.models[0];
    if (first) set('AI_MODEL', first.value);
  }

  async function test() {
    if (busy) return;
    setBusy(true);
    setSuccess(null);
    setFailure(null);
    try {
      const key = (draft.AI_API_KEY ?? '').trim();
      const probe = await adminApi.probeAi({
        baseUrl: baseUrl || undefined,
        model: model || undefined,
        // مقدار ماسک‌شده یعنی «کلید ذخیره‌شده»؛ فرستادنش خطای احراز هویت می‌دهد.
        apiKey: key && !key.includes('•') ? key : undefined,
      });
      if (probe.ok) {
        setSuccess({ latencyMs: probe.latencyMs, sample: probe.sample ?? '' });
      } else {
        const split = splitProviderError(probe.error ?? '');
        setFailure({
          headline: split.headline,
          detail: split.detail,
          code: split.code || (probe.status ? String(probe.status) : ''),
          model: probe.model,
          provider: probe.provider,
          latencyMs: probe.latencyMs,
        });
      }
    } catch (problem) {
      const raw = problem instanceof AdminError ? problem.message : 'درخواست آزمون انجام نشد.';
      const split = splitProviderError(raw);
      setFailure({ headline: split.headline, detail: split.detail, code: split.code, model, provider: baseUrl, latencyMs: 0 });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card card-pad ai-route">
      <div className="ai-route-head">
        <span className="stat-ico"><IconSparkles size={15} /></span>
        <div style={{ minWidth: 0 }}>
          <div className="card-title" style={{ margin: 0 }}>مسیر مدل</div>
          <div className="card-desc">میزبان را انتخاب کنید؛ فهرست مدل‌های همان میزبان باز می‌شود. آزمون، همین مقدارهای ذخیره‌نشده را امتحان می‌کند.</div>
        </div>
      </div>

      {/* ------------------------------------------------------------ میزبان */}
      <div className="ai-host" ref={menuRef}>
        <div className="ai-field-lab" style={{ marginBottom: 5 }}>میزبان مدل</div>
        <button
          type="button"
          className="ai-host-btn"
          aria-expanded={open}
          aria-haspopup="listbox"
          onClick={() => setOpen(value => !value)}
        >
          <span className="stat-ico" style={{ width: 26, height: 26, borderRadius: 8 }}>
            <IconSparkles size={12} />
          </span>
          <span style={{ display: 'grid', minWidth: 0 }}>
            <span className="nm">{active?.label ?? 'انتخاب میزبان'}</span>
            <span className="url">{baseUrl || 'آدرس درگاه تنظیم نشده'}</span>
          </span>
          <IconChevronDown size={15} className="chev" />
        </button>

        {open && (
          <div className="ai-host-menu" role="listbox" aria-label="میزبان مدل">
            {providers.map(provider => (
              <button
                key={provider.id}
                type="button"
                role="option"
                aria-selected={active?.id === provider.id}
                className={`ai-host-opt${active?.id === provider.id ? ' on' : ''}`}
                onClick={() => chooseHost(provider)}
              >
                <span style={{ display: 'grid', minWidth: 0, textAlign: 'start' }}>
                  <span className="nm">{provider.label}</span>
                  <span className="url">{provider.custom ? 'آدرس را خودتان وارد می‌کنید' : provider.baseUrl}</span>
                </span>
                {active?.id === provider.id && <IconCheck size={14} className="tick" />}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* میزبان دستی: آدرس درگاه */}
      {active?.custom && (
        <div>
          <div className="ai-field-lab" style={{ marginBottom: 5 }}>آدرس درگاه (سازگار با OpenAI)</div>
          <input
            className="input input-ltr"
            type="text"
            dir="ltr"
            spellCheck={false}
            placeholder="https://my-llm.example.com/v1"
            value={draft.AI_BASE_URL ?? ''}
            onChange={event => { set('AI_BASE_URL', event.target.value); setSuccess(null); }}
            aria-label="آدرس درگاه مدل"
          />
        </div>
      )}

      {/* --------------------------------------------------------------- مدل */}
      <div className="ai-pick">
        <div className="row-between" style={{ gap: 8 }}>
          <span className="ai-field-lab">مدل</span>
          <span className="small muted num">{visible.length.toLocaleString('fa-IR')} مدل</span>
        </div>

        <div className="ai-pick-bar">
          <div className="ai-search">
            <IconSearch size={14} className="mag" />
            <input
              className="input"
              type="text"
              value={query}
              placeholder="جست‌وجوی مدل… (مثلاً gemini یا :free)"
              onChange={event => setQuery(event.target.value)}
              aria-label="جست‌وجوی مدل"
            />
          </div>
          <button
            type="button"
            className={`ai-free${freeOnly ? ' on' : ''}`}
            aria-pressed={freeOnly}
            onClick={() => setFreeOnly(value => !value)}
            title="فقط مدل‌هایی که رایگان هستند"
          >
            {freeOnly ? <IconCheck size={12} /> : null}
            فقط رایگان
          </button>
        </div>

        <div className="ai-list" role="listbox" aria-label="مدل‌ها">
          {visible.map(item => (
            <button
              key={item.value}
              type="button"
              role="option"
              aria-selected={model === item.value}
              className={`ai-opt${model === item.value ? ' on' : ''}`}
              onClick={() => { set('AI_MODEL', item.value); setSuccess(null); }}
              title={item.hint ?? item.label}
            >
              <span className="mv">{item.value}</span>
              {item.free && <span className="free">FREE</span>}
              <span className="ml">{item.hint ?? item.label}</span>
              {model === item.value && <IconCheck size={13} className="ok-mark" />}
            </button>
          ))}

          {canUseTyped && (
            <button
              type="button"
              className={`ai-opt custom${model === query.trim() ? ' on' : ''}`}
              onClick={() => { set('AI_MODEL', query.trim()); setSuccess(null); }}
            >
              <span className="mv">استفاده از «{query.trim()}»</span>
              <span className="ml">نام دلخواه؛ همان‌طور که در مستندات ارائه‌دهنده آمده</span>
            </button>
          )}

          {visible.length === 0 && !canUseTyped && (
            <div className="ai-empty">
              مدلی با این فیلتر نیست. فیلتر «فقط رایگان» را بردارید یا نام مدل را تایپ و انتخاب کنید.
            </div>
          )}
        </div>

        <div className="small muted" style={{ display: 'flex', gap: 6, alignItems: 'baseline', minWidth: 0 }}>
          <span>مدل انتخاب‌شده:</span>
          <b className="ltr" style={{ overflowWrap: 'anywhere' }}>{model || '—'}</b>
        </div>

        {/* ------------------------------------------------------ آزمون مدل */}
        <div className="ai-test">
          <button
            type="button"
            className={`btn btn-sm ${success ? 'btn-primary ok' : 'btn-outline'}`}
            onClick={() => void test()}
            disabled={busy}
          >
            {busy ? <Spinner size={13} /> : success ? <IconCheck size={14} /> : <IconSparkles size={14} />}
            {success ? `اتصال برقرار است · ${success.latencyMs.toLocaleString('fa-IR')}ms` : 'آزمون اتصال با این مدل'}
          </button>
          {success && (
            <span className="note">
              پاسخ آزمایشی: {success.sample ? success.sample.slice(0, 60) : '—'} — برای ماندگاری، تنظیمات را ذخیره کنید.
            </span>
          )}
          {!success && <span className="note">یک درخواست واقعی به درگاه؛ چیزی ذخیره نمی‌شود.</span>}
        </div>
      </div>

      {failure && (
        <div className="adm-modal-veil" role="alertdialog" aria-modal="true" aria-label="خطای آزمون مدل" onClick={() => setFailure(null)}>
          <div className="adm-modal" onClick={event => event.stopPropagation()}>
            <div className="adm-modal-head">
              <IconAlertCircle size={16} />
              <span className="ttl">آزمون مدل ناموفق بود</span>
              <button type="button" className="btn btn-ghost btn-icon btn-sm x" onClick={() => setFailure(null)} aria-label="بستن">
                <IconX size={14} />
              </button>
            </div>

            <div className="adm-modal-body">
              <div className="adm-modal-row">
                <span className="k">مدل</span>
                <span className="v mono">{failure.model || '—'}</span>
              </div>
              <div className="adm-modal-row">
                <span className="k">درگاه</span>
                <span className="v mono">{failure.provider || '—'}</span>
              </div>
              <div className="adm-modal-row">
                <span className="k">زمان پاسخ</span>
                <span className="v num">{failure.latencyMs.toLocaleString('fa-IR')}ms</span>
              </div>
              <div className="adm-modal-row">
                <span className="k">پیام</span>
                <span className="v">{failure.headline}</span>
              </div>
              {failure.detail && <div className="adm-modal-detail">{failure.detail}</div>}
              <div className="adm-modal-hint">
                {failure.code === '401' || /api key|unauthor/i.test(failure.headline)
                  ? 'کلید API پذیرفته نشد؛ کلید همین میزبان را در فیلد پایین صفحه بگذارید.'
                  : failure.code === '404' || /not a valid model|model/i.test(failure.headline)
                    ? 'نام مدل برای این میزبان معتبر نیست؛ از فهرست بالا یک مدل دیگر انتخاب کنید یا نام دقیق را از مستندات میزبان بردارید.'
                    : failure.code === '429'
                      ? 'سقف مصرف یا محدودیت نرخ؛ کمی بعد دوباره امتحان کنید.'
                      : 'آدرس درگاه، کلید و نام مدل را بررسی کنید. اگر میزبان محلی است، از دسترس‌پذیری آن از سرور مطمئن شوید.'}
              </div>
            </div>
            <div className="adm-modal-timer"><i /></div>
          </div>
        </div>
      )}
    </section>
  );
}
