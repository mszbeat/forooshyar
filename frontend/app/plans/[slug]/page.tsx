'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { MONTH_CHIPS, durationDiscountPercent, plansApi, type Plan, type Quote } from '@/lib/plans';
import { toman } from '@/lib/format';
import { useAuth } from '@/lib/auth';
import { IconArrowLeft, IconCheckCircle, IconInstagram, IconLock, IconStore, IconTelegram } from '@/components/icons';

const fa = (n: number) => n.toLocaleString('fa-IR');

function discountPercent(plan: Plan): number {
  if (!plan.listMonthlyPrice || plan.listMonthlyPrice <= plan.monthlyPrice) return 0;
  return Math.round(((plan.listMonthlyPrice - plan.monthlyPrice) / plan.listMonthlyPrice) * 100);
}

export default function PlanDetailPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const { token, ready } = useAuth();

  const [plan, setPlan] = useState<Plan | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [months, setMonths] = useState(1);
  const [extraInstagram, setExtraInstagram] = useState(0);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    plansApi.bySlug(params.slug).then(setPlan).catch(() => setNotFound(true));
  }, [params.slug]);

  const refreshQuote = useCallback(async () => {
    if (!plan) return;
    setQuoteLoading(true);
    try {
      const q = await plansApi.quote({ planId: plan.id, months, extraInstagram });
      setQuote(q);
      setError('');
    } catch {
      setQuote(null);
    } finally {
      setQuoteLoading(false);
    }
  }, [plan, months, extraInstagram]);

  useEffect(() => {
    const timer = setTimeout(refreshQuote, 250);
    return () => clearTimeout(timer);
  }, [refreshQuote]);

  const clientDiscount = useMemo(() => durationDiscountPercent(months), [months]);
  const maxExtra = Math.max(0, (plan?.instagramLimit ?? 1) - 1);
  const expiry = useMemo(() => {
    if (!quote?.endsAt) return null;
    try {
      return new Intl.DateTimeFormat('fa-IR', { dateStyle: 'long' }).format(new Date(quote.endsAt));
    } catch {
      return null;
    }
  }, [quote]);

  async function checkout() {
    if (!plan) return;
    setError('');
    if (!token) {
      router.push(`/login?mode=register&next=${encodeURIComponent(`/plans/${plan.slug}`)}`);
      return;
    }
    setPaying(true);
    try {
      const { url } = await plansApi.checkout({ planId: plan.id, months, extraInstagram });
      window.location.href = url;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'خطا در پرداخت');
      setPaying(false);
    }
  }

  if (notFound) {
    return (
      <div className="land">
        <div className="land-wrap plan-detail">
          <p className="plan-detail-missing">این پلن پیدا نشد یا غیرفعال است.</p>
          <Link className="btn btn-outline" href="/#plans"><IconArrowLeft size={15} /> بازگشت به پلن‌ها</Link>
        </div>
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="land">
        <div className="land-wrap plan-detail">
          <div className="plan-detail-skeleton" aria-label="در حال بارگذاری" />
        </div>
      </div>
    );
  }

  const discount = discountPercent(plan);

  return (
    <div className="land">
      <div className="land-wrap plan-detail">
        <Link className="plan-detail-back" href="/#plans"><IconArrowLeft size={15} /> همه پلن‌ها</Link>

        <div className="plan-detail-grid">
          <div className="plan-detail-main">
            <div className="plan-detail-head">
              <span className="plan-card-ico"><IconStore size={20} /></span>
              <div>
                <h1 className="plan-detail-name">{plan.name}</h1>
                {plan.tagline && <p className="plan-detail-tagline">{plan.tagline}</p>}
              </div>
              {plan.isPopular && <span className="plan-popular-badge" style={{ position: 'static' }}>محبوب‌ترین</span>}
            </div>

            {plan.description && <p className="plan-detail-desc">{plan.description}</p>}

            <div className="plan-detail-limits">
              <span className="plan-limit-chip"><IconInstagram size={15} /> {plan.instagramLimit} اتصال اینستاگرام</span>
              <span className="plan-limit-chip"><IconTelegram size={15} /> {plan.telegramLimit} اتصال تلگرام</span>
              <span className="plan-limit-chip">{plan.monthlyMessageLimit > 0 ? `${fa(plan.monthlyMessageLimit)} پیام در ماه` : 'پیام نامحدود'}</span>
              <span className="plan-limit-chip">{plan.productLimit > 0 ? `${fa(plan.productLimit)} محصول` : 'محصول نامحدود'}</span>
            </div>

            <ul className="plan-detail-feats">
              {(plan.features ?? []).map(feature => (
                <li key={feature}><IconCheckCircle size={16} className="plan-feat-ico" />{feature}</li>
              ))}
            </ul>

            <div className="plan-detail-options">
              <div className="plan-opt">
                <div className="plan-opt-head">
                  <span>مدت اشتراک</span>
                  {clientDiscount > 0 && <span className="plan-card-discount">٪{clientDiscount} تخفیف مدت</span>}
                </div>
                <div className="plan-months" role="group" aria-label="مدت اشتراک">
                  {MONTH_CHIPS.map(m => (
                    <button
                      key={m}
                      type="button"
                      className={`plan-month ${months === m ? 'active' : ''}`}
                      aria-pressed={months === m}
                      onClick={() => setMonths(m)}
                    >
                      {fa(m)} ماه
                    </button>
                  ))}
                </div>
              </div>

              <div className="plan-opt">
                <div className="plan-opt-head">
                  <span>پیج اینستاگرام اضافه</span>
                  <span className="small muted">{toman(plan.extraInstagramPrice)} برای هر پیج</span>
                </div>
                <div className="plan-extra">
                  <button type="button" className="plan-stepper" aria-label="کاهش پیج اضافه" disabled={extraInstagram <= 0} onClick={() => setExtraInstagram(n => Math.max(0, n - 1))}>−</button>
                  <span className="plan-extra-count">{fa(extraInstagram)} پیج</span>
                  <button type="button" className="plan-stepper" aria-label="افزایش پیج اضافه" disabled={extraInstagram >= maxExtra} onClick={() => setExtraInstagram(n => Math.min(maxExtra, n + 1))}>+</button>
                </div>
                <p className="small muted">درگاه پرداخت اینستاگرام برای هر پیج جداگانه فعال می‌شود.</p>
              </div>
            </div>
          </div>

          <aside className="plan-detail-side">
            <div className="plan-summary">
              <div className="plan-summary-head">خلاصه خرید</div>
              <dl className="plan-summary-rows">
                <div><dt>قیمت ماهانه</dt><dd>{toman(plan.monthlyPrice)}</dd></div>
                <div><dt>مدت</dt><dd>{fa(months)} ماه</dd></div>
                {quote && quote.durationDiscountPercent > 0 && (
                  <div><dt>تخفیف مدت</dt><dd className="plan-summary-save">٪{quote.durationDiscountPercent}−</dd></div>
                )}
                {quote && quote.extraInstagram > 0 && (
                  <div><dt>پیج اضافه ({fa(quote.extraInstagram)})</dt><dd>{toman(quote.addonMonthly * quote.months)}</dd></div>
                )}
                {quote && quote.codeDiscountAmount > 0 && (
                  <div><dt>تخفیف</dt><dd className="plan-summary-save">−{toman(quote.codeDiscountAmount)}</dd></div>
                )}
                <div className="plan-summary-total">
                  <dt>مبلغ قابل پرداخت</dt>
                  <dd>{quoteLoading || !quote ? '…' : toman(quote.total)}</dd>
                </div>
              </dl>
              {expiry && <p className="plan-summary-expiry">اعتبار اشتراک تا {expiry}</p>}
              {error && <p className="plan-summary-error" role="alert">{error}</p>}
              <button type="button" className="btn btn-primary btn-block" disabled={paying || quoteLoading || !quote} onClick={checkout}>
                {paying ? 'در حال انتقال به درگاه…' : token ? 'پرداخت و فعال‌سازی' : 'ثبت‌نام و پرداخت'}
              </button>
              <p className="plan-summary-note">
                <IconLock size={13} /> پرداخت امن با درگاه بانکی؛ پس از پرداخت، اشتراک بلافاصله فعال می‌شود.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
