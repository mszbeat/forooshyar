'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { plansApi, type Plan } from '@/lib/plans';
import { toman } from '@/lib/format';
import { IconArrowLeft, IconCheckCircle, IconCrown, IconGift, IconGraduationCap, IconStore } from '@/components/icons';

const TRIAL_FEATURES = [
  '۶ روز آزمایش رایگان',
  '۱ اتصال اینستاگرام + ۱ اتصال تلگرام',
  'پاسخ خودکار از کاتالوگ زنده',
  'بدون نیاز به کارت بانکی',
];

function discountPercent(plan: Plan): number {
  if (!plan.listMonthlyPrice || plan.listMonthlyPrice <= plan.monthlyPrice) return 0;
  return Math.round(((plan.listMonthlyPrice - plan.monthlyPrice) / plan.listMonthlyPrice) * 100);
}

/** کارت پلن — کل کارت یک لینک است و با کیبورد هم قابل فعال‌سازی است. */
function PlanCard({ plan, index }: { plan: Plan; index: number }) {
  const ref = useRef<HTMLAnchorElement>(null);
  const discount = discountPercent(plan);

  function onMove(event: React.MouseEvent) {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${event.clientX - rect.left}px`);
    el.style.setProperty('--my', `${event.clientY - rect.top}px`);
  }

  return (
    <Link
      ref={ref}
      href={`/plans/${plan.slug}`}
      className={`plan-card fx ${plan.isPopular ? 'plan-card-popular' : ''}`}
      style={{ '--fx-delay': `${index * 90}ms` } as React.CSSProperties}
      onMouseMove={onMove}
      aria-label={`جزئیات پلن ${plan.name}`}
    >
      {plan.isPopular && <span className="plan-popular-badge">محبوب‌ترین</span>}
      <span className="plan-card-ico"><IconStore size={20} /></span>
      <span className="plan-card-name">{plan.name}</span>
      {plan.tagline && <span className="plan-card-tagline">{plan.tagline}</span>}
      <span className="plan-card-price">
        {discount > 0 && <span className="plan-card-list">{toman(plan.listMonthlyPrice)}</span>}
        <b>{toman(plan.monthlyPrice)}</b>
        <small>/ ماه</small>
        {discount > 0 && <span className="plan-card-discount">٪{discount} تخفیف</span>}
      </span>
      <span className="plan-card-limits">
        {plan.instagramLimit} اتصال اینستاگرام · {plan.telegramLimit} اتصال تلگرام
      </span>
      <span className="plan-card-feats">
        {(plan.features ?? []).slice(0, 5).map(feature => (
          <span key={feature} className="plan-feat">
            <IconCheckCircle size={15} className="plan-feat-ico" />
            {feature}
          </span>
        ))}
      </span>
      <span className={`btn ${plan.isPopular ? 'btn-primary' : 'btn-outline'} btn-block plan-card-cta`}>
        مشاهده جزئیات و خرید
        <IconArrowLeft size={15} />
      </span>
    </Link>
  );
}

export function LandingPlans() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);

  useEffect(() => {
    plansApi.list().then(setPlans).catch(() => undefined);
  }, []);

  const popular = plans.find(plan => plan.isPopular) ?? plans[1] ?? plans[0];

  return (
    <section className="sec alt" id="plans">
      <div className="land-wrap">
        <div className="sec-head center fx">
          <span className="eyebrow">پلن‌های اشتراک</span>
          <h2 className="sec-title">پلنی متناسب با <span className="dim">فروشگاهتان</span></h2>
          <p className="sec-lead">
            هر پلن شامل پاسخ خودکار از کاتالوگ زنده است؛ فقط سقف اتصال و پیام فرق می‌کند.
            هر پیج اینستاگرام اضافه هزینه‌ی خودش را دارد و تلگرام در سقف پلن گنجانده شده است.
          </p>
        </div>

        <div className="plan-grid">
          {/* شروع رایگان */}
          <Link href="/login?mode=register" className="plan-card fx" style={{ '--fx-delay': '0ms' } as React.CSSProperties} aria-label="شروع رایگان">
            <span className="plan-card-ico"><IconGift size={20} /></span>
            <span className="plan-card-name">شروع رایگان</span>
            <span className="plan-card-tagline">بدون کارت بانکی، در ۳ دقیقه</span>
            <span className="plan-card-price"><b>رایگان</b><small>/ ۶ روز</small></span>
            <span className="plan-card-limits">۱ اتصال اینستاگرام · ۱ اتصال تلگرام</span>
            <span className="plan-card-feats">
              {TRIAL_FEATURES.map(feature => (
                <span key={feature} className="plan-feat">
                  <IconCheckCircle size={15} className="plan-feat-ico" />
                  {feature}
                </span>
              ))}
            </span>
            <span className="btn btn-outline btn-block plan-card-cta">
              ساخت فروشگاه رایگان
              <IconArrowLeft size={15} />
            </span>
          </Link>

          {plans.map((plan, index) => (
            <PlanCard key={plan.id} plan={plan} index={index + 1} />
          ))}

          {/* پلن اختصاصی */}
          <Link href="/support" className="plan-card fx" style={{ '--fx-delay': `${(plans.length + 1) * 90}ms` } as React.CSSProperties} aria-label="پلن اختصاصی">
            <span className="plan-card-ico"><IconCrown size={20} /></span>
            <span className="plan-card-name">اختصاصی</span>
            <span className="plan-card-tagline">برای کسب‌وکارهای بزرگ و آژانس‌ها</span>
            <span className="plan-card-price"><b>تماس بگیرید</b></span>
            <span className="plan-card-limits">سقف دلخواه · قرارداد اختصاصی</span>
            <span className="plan-card-feats">
              <span className="plan-feat"><IconCheckCircle size={15} className="plan-feat-ico" />سقف اتصال و پیام دلخواه</span>
              <span className="plan-feat"><IconCheckCircle size={15} className="plan-feat-ico" />راه‌اندازی اختصاصی دستیار</span>
              <span className="plan-feat"><IconCheckCircle size={15} className="plan-feat-ico" />مدیر حساب اختصاصی</span>
            </span>
            <span className="btn btn-outline btn-block plan-card-cta">
              درخواست مشاوره
              <IconArrowLeft size={15} />
            </span>
          </Link>
        </div>

        {plans.length > 0 && (
          <div className="plan-compare fx" style={{ '--fx-delay': '120ms' } as React.CSSProperties}>
            <button
              type="button"
              className="plan-compare-toggle"
              aria-expanded={compareOpen}
              onClick={() => setCompareOpen(open => !open)}
            >
              <IconGraduationCap size={16} />
              مقایسه کامل پلن‌ها
              <span className={`plan-compare-arrow ${compareOpen ? 'open' : ''}`}>▾</span>
            </button>
            <div className={`plan-compare-body ${compareOpen ? 'open' : ''}`}>
              <div className="plan-compare-scroll">
                <table className="plan-compare-table">
                  <thead>
                    <tr>
                      <th>امکان</th>
                      {plans.map(plan => (
                        <th key={plan.id} className={plan.id === popular?.id ? 'is-popular' : ''}>{plan.name}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>اتصال اینستاگرام</td>
                      {plans.map(plan => <td key={plan.id}>{plan.instagramLimit} پیج</td>)}
                    </tr>
                    <tr>
                      <td>اتصال تلگرام</td>
                      {plans.map(plan => <td key={plan.id}>{plan.telegramLimit} بات</td>)}
                    </tr>
                    <tr>
                      <td>سقف پیام ماهانه</td>
                      {plans.map(plan => <td key={plan.id}>{plan.monthlyMessageLimit > 0 ? plan.monthlyMessageLimit.toLocaleString('fa-IR') : 'نامحدود'}</td>)}
                    </tr>
                    <tr>
                      <td>سقف محصول</td>
                      {plans.map(plan => <td key={plan.id}>{plan.productLimit > 0 ? plan.productLimit.toLocaleString('fa-IR') : 'نامحدود'}</td>)}
                    </tr>
                    <tr>
                      <td>قیمت ماهانه</td>
                      {plans.map(plan => <td key={plan.id}>{toman(plan.monthlyPrice)}</td>)}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        <p className="plan-note fx" style={{ '--fx-delay': '160ms' } as React.CSSProperties}>
          مدت اشتراک ۱ تا ۱۸ ماه قابل انتخاب است و هرچه بیشتر، تخفیف بیشتر.
          پس از پایان اشتراک، اتصال‌ها قفل می‌شوند ولی داده‌های فروشگاه محفوظ می‌مانند.
        </p>
      </div>
    </section>
  );
}
