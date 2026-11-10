'use client';

import { SettingsPanel } from '@/components/admin/settings-panel';
import { IconAlertCircle, IconInfo, IconWallet } from '@/components/icons';

export default function AdminPaymentsPage() {
  return (
    <>
      <SettingsPanel group="payments" />
      <div className="grid g-2" style={{ gap: 14 }}>
        <section className="card card-pad" style={{ display: 'grid', gap: 10, alignContent: 'start' }}>
          <div className="row" style={{ gap: 10 }}>
            <span className="stat-ico"><IconWallet size={15} /></span>
            <div className="card-title" style={{ margin: 0 }}>حالت آزمایشی و حالت واقعی</div>
          </div>
          <div className="kv">
            <div className="kv-row"><span className="kv-k">بدون شناسه‌ی پذیرنده</span><span className="kv-v">درگاه آزمایشی؛ لینک پرداخت داخلی ساخته می‌شود و پولی جابه‌جا نمی‌شود.</span></div>
            <div className="kv-row"><span className="kv-k">با شناسه‌ی پذیرنده</span><span className="kv-v">درخواست واقعی به زرین‌پال؛ کد رهگیری و بازگشت پرداخت فعال می‌شود.</span></div>
          </div>
          <div className="adm-note warn">
            <IconAlertCircle size={16} />
            <span>پیش از فعال‌کردن درگاه واقعی، آدرس بازگشت (<b className="num">PUBLIC_API_URL</b>) را در بخش تلگرام بررسی کنید؛ اگر اشتباه باشد، پرداخت موفق هم «ناموفق» ثبت می‌شود.</span>
          </div>
        </section>

        <section className="card card-pad" style={{ display: 'grid', gap: 10, alignContent: 'start' }}>
          <div className="row" style={{ gap: 10 }}>
            <span className="stat-ico"><IconInfo size={15} /></span>
            <div className="card-title" style={{ margin: 0 }}>مسیر پول در بات</div>
          </div>
          <ol className="steps-plain">
            <li><span className="n num">۱</span><span>مشتری سفارش را داخل بات نهایی می‌کند و موجودی همان لحظه رزرو می‌شود.</span></li>
            <li><span className="n num">۲</span><span>بات لینک پرداخت را می‌فرستد؛ سفارش تا پرداخت «در انتظار» می‌ماند.</span></li>
            <li><span className="n num">۳</span><span>بازگشت از درگاه، سفارش را «پرداخت‌شده» می‌کند و فروشنده اعلان می‌گیرد.</span></li>
            <li><span className="n num">۴</span><span>اگر سفارش لغو شود، موجودی رزروشده برمی‌گردد و درخواست‌های «خبرم کن» بررسی می‌شوند.</span></li>
          </ol>
        </section>
      </div>
    </>
  );
}
