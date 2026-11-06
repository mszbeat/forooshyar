import Link from 'next/link';
import './landing.css';
import {
  IconArrowLeft, IconBolt, IconChat, IconCheckCircle, IconLogo, IconPackage,
  IconShield, IconSparkles, IconStore, IconTrendUp, IconUpload, IconClock,
} from '@/components/icons';

const features = [
  {
    icon: <IconChat />,
    title: 'پاسخ خودکار از کاتالوگ زنده',
    text: 'مشتری می‌پرسد «این مانتو موجوده؟» و پاسخ در همان لحظه از موجودی ثبت‌شده خودتان ساخته می‌شود؛ بدون اسکریپت، بدون حدس.',
  },
  {
    icon: <IconPackage />,
    title: 'موجودی و دفتر گردش',
    text: 'هر فروش، هر شارژ و هر اصلاح دستی در یک تراکنش اتمیک ثبت می‌شود. تاریخچه کامل هر واریانت همیشه در دسترس است.',
  },
  {
    icon: <IconUpload />,
    title: 'آپلود اکسل و CSV',
    text: 'کل کاتالوگ را یک‌جا وارد کنید. سیستم هر ردیف را جدا بررسی می‌کند و خطای دقیق همان ردیف را به شما برمی‌گرداند.',
  },
  {
    icon: <IconBolt />,
    title: 'دکمه «فروخته شد»',
    text: 'در چند ثانیه از گوشی ثبت کنید. کاهش موجودی محافظت‌شده است و در شرایط هم‌زمانی هرگز منفی نمی‌شود.',
  },
  {
    icon: <IconTrendUp />,
    title: 'داشبورد تصمیم‌گیری',
    text: 'فروش امروز و هفته، ارزش انبار، محصولات کم‌موجود و موجودی قدیمی که باید بازبینی شود — همه در یک صفحه.',
  },
  {
    icon: <IconSparkles />,
    title: 'تست پاسخ پیش از انتشار',
    text: 'گفتگوی آزمایشی داخل پنل: ببینید بات به هر سؤال چه جوابی می‌دهد و چه زمان تصمیم می‌گیرد کار را به شما بسپارد.',
  },
];

const principles = [
  { icon: <IconShield />, title: 'قیمت فقط از دیتابیس', text: 'هیچ عددی از مدل زبانی ساخته نمی‌شود؛ منبع قیمت و موجودی همیشه پایگاه داده شماست.' },
  { icon: <IconCheckCircle />, title: 'اگر مطمئن نیست، ارجاع می‌دهد', text: 'سؤال مبهم یا خارج از کاتالوگ به شما ارجاع داده می‌شود. حدس‌زدن دربارهٔ قیمت و موجودی ممنوع است.' },
  { icon: <IconStore />, title: 'جداسازی کامل فروشگاه‌ها', text: 'هر رکورد به فروشگاه خودش قفل است و هر کوئری با شناسه فروشگاه فیلتر می‌شود.' },
];

export default function LandingPage() {
  return (
    <div className="land">
      <nav className="land-nav">
        <div className="brand">
          <span className="brand-mark"><IconLogo size={20} /></span>
          <div>
            <div className="brand-name">فروش‌یار</div>
            <div className="brand-sub">دستیار فروش فارسی</div>
          </div>
        </div>
        <div className="land-links">
          <a href="#features">امکانات</a>
          <a href="#how">چطور کار می‌کند</a>
          <a href="#principles">اصول</a>
        </div>
        <div className="land-nav-actions">
          <Link className="btn btn-ghost btn-sm" href="/login">ورود</Link>
          <Link className="btn btn-primary btn-sm" href="/login?mode=register">
            ساخت فروشگاه
            <IconArrowLeft size={15} />
          </Link>
        </div>
      </nav>

      <header className="land-hero">
        <div>
          <span className="hero-badge">
            <span className="dot" />
            ساخته‌شده برای فروشگاه‌های فارسی‌زبان
          </span>
          <h1 className="hero-title">
            دستیاری که <em>قیمت و موجودی</em> را<br />
            از کاتالوگ خودت می‌خواند
          </h1>
          <p className="hero-lead">
            فروش‌یار به سؤال‌های تکراری مشتری‌ها در تلگرام و اینستاگرام پاسخ می‌دهد،
            موجودی را برایتان دقیق نگه می‌دارد و هر جا مطمئن نبود، گفتگو را به شما می‌سپارد.
          </p>
          <div className="hero-actions">
            <Link className="btn btn-primary btn-lg" href="/login?mode=register">
              شروع رایگان
              <IconArrowLeft size={18} />
            </Link>
            <Link className="btn btn-outline btn-lg" href="/login">
              ورود به پنل
            </Link>
          </div>
          <div className="hero-proof">
            <span><IconCheckCircle size={15} /> راه‌اندازی در کمتر از ۱۵ دقیقه</span>
            <span><IconClock size={15} /> پاسخ در همان لحظه</span>
            <span><IconShield size={15} /> داده‌های هر فروشگاه جدا</span>
          </div>
        </div>

        <div className="mock" aria-hidden="true">
          <div className="mock-bar">
            <span className="mock-dot" /><span className="mock-dot" /><span className="mock-dot" />
          </div>
          <div className="mock-body">
            <div className="mock-side">
              <div className="mock-pill on" style={{ height: 30 }} />
              <div className="mock-pill" /><div className="mock-pill" /><div className="mock-pill" />
              <div className="mock-pill" style={{ width: '70%' }} />
              <div className="mock-pill" style={{ width: '55%', marginTop: 'auto' }} />
            </div>
            <div>
              <div className="mock-cards">
                <div className="mock-card"><div className="k">فروش امروز</div><div className="v">۴٫۲ م</div></div>
                <div className="mock-card"><div className="k">موجودی کل</div><div className="v">۸۴</div></div>
              </div>
              <div className="mock-chart">
                {[38, 62, 30, 78, 46, 90, 58].map((height, index) => (
                  <i key={index} style={{ height: `${height}%` }} />
                ))}
              </div>
              <div className="mock-card" style={{ marginTop: 10 }}>
                <div className="k">آخرین گفتگو</div>
                <div style={{ fontSize: 11, marginTop: 3, color: 'var(--ink-2)' }}>
                  «سلام، مانتو کتان سایز M موجوده؟»
                </div>
                <div style={{ fontSize: 11, marginTop: 4, color: 'var(--brand)', fontWeight: 600 }}>
                  بله، ۱۲ عدد موجود است — ۸۹۰٬۰۰۰ تومان
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <section className="land-section" id="features">
        <div className="section-eyebrow">امکانات</div>
        <h2 className="section-title">هر چیزی که برای فروش دقیق لازم دارید</h2>
        <p className="section-lead">
          پنل فروشنده فروش‌یار حول یک اصل ساخته شده: اطلاعات فروشگاه شما باید همیشه درست، به‌روز و قابل اعتماد باشد.
        </p>
        <div className="feature-grid">
          {features.map(feature => (
            <article className="feature" key={feature.title}>
              <div className="feature-ico">{feature.icon}</div>
              <h3>{feature.title}</h3>
              <p>{feature.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="land-section" id="how">
        <div className="section-eyebrow">شروع سریع</div>
        <h2 className="section-title">سه قدم تا اولین پاسخ خودکار</h2>
        <div className="steps">
          <div className="step">
            <h3>فروشگاه را بسازید</h3>
            <p>نام فروشگاه، لحن پاسخ، شرایط ارسال و پرداخت را وارد کنید. همین چند فیلد برای شروع کافی است.</p>
          </div>
          <div className="step">
            <h3>کاتالوگ را وارد کنید</h3>
            <p>محصول و سایزها را دستی اضافه کنید یا فایل اکسل/CSV را یک‌جا بارگذاری کنید.</p>
          </div>
          <div className="step">
            <h3>پاسخ را تست کنید</h3>
            <p>در گفتگوی آزمایشی ببینید بات چه می‌گوید و کجا تصمیم می‌گیرد سؤال را به شما ارجاع دهد.</p>
          </div>
        </div>
      </section>

      <section className="land-section" id="principles">
        <div className="section-eyebrow">اصول طراحی</div>
        <h2 className="section-title">چرا می‌توانید به پاسخ‌ها اعتماد کنید</h2>
        <div className="principles">
          {principles.map(principle => (
            <div className="principle" key={principle.title}>
              {principle.icon}
              <div>
                <strong>{principle.title}</strong>
                <span>{principle.text}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="cta-band">
        <div>
          <h2>همین امروز کاتالوگ‌تان را وارد کنید</h2>
          <p>راه‌اندازی بدون تنظیمات پیچیده؛ اولین محصول را در چند دقیقه ثبت کنید و پاسخ‌های خودکار را ببینید.</p>
        </div>
        <Link className="btn btn-lg" href="/login?mode=register">
          ساخت فروشگاه
          <IconArrowLeft size={18} />
        </Link>
      </section>

      <footer className="land-footer">
        <span>© ۱۴۰۵ فروش‌یار — دستیار فروش فارسی</span>
        <div className="links">
          <span>حریم خصوصی</span>
          <span>شرایط استفاده</span>
          <span>پشتیبانی</span>
        </div>
      </footer>
    </div>
  );
}
