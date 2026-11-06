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
    text: 'کل کاتالوگ را یک‌جا وارد کنید. سیستم هر ردیف را جدا بررسی می‌کند و خطای دقیق همان ردیف را برمی‌گرداند.',
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
    text: 'گفتگوی آزمایشی داخل پنل: ببینید دستیار به هر سؤال چه جوابی می‌دهد و چه زمان تصمیم می‌گیرد کار را به شما بسپارد.',
  },
];

const principles = [
  { icon: <IconShield />, title: 'قیمت فقط از دیتابیس', text: 'هیچ عددی از مدل زبانی ساخته نمی‌شود؛ منبع قیمت و موجودی همیشه پایگاه داده شماست.' },
  { icon: <IconCheckCircle />, title: 'اگر مطمئن نیست، ارجاع می‌دهد', text: 'سؤال مبهم یا خارج از کاتالوگ به شما ارجاع داده می‌شود. حدس‌زدن دربارهٔ قیمت و موجودی ممنوع است.' },
  { icon: <IconStore />, title: 'جداسازی کامل فروشگاه‌ها', text: 'هر رکورد به فروشگاه خودش قفل است و هر کوئری با شناسه فروشگاه فیلتر می‌شود.' },
];

const steps = [
  { n: '۰۱', title: 'فروشگاه را بسازید', text: 'نام فروشگاه، لحن پاسخ، شرایط ارسال و پرداخت را وارد کنید. همین چند فیلد برای شروع کافی است.' },
  { n: '۰۲', title: 'کاتالوگ را وارد کنید', text: 'محصول و سایزها را دستی اضافه کنید یا فایل اکسل/CSV را یک‌جا بارگذاری کنید.' },
  { n: '۰۳', title: 'پاسخ را تست کنید', text: 'در گفتگوی آزمایشی ببینید دستیار چه می‌گوید و کجا تصمیم می‌گیرد سؤال را به شما ارجاع دهد.' },
];

const facts = [
  { v: '۱۵ دقیقه', l: 'تا اولین محصول ثبت‌شده' },
  { v: '۰', l: 'حدس در قیمت و موجودی' },
  { v: '۱۰۰٪', l: 'فارسی و راست‌به‌چپ' },
  { v: '۲', l: 'کانال: تلگرام و اینستاگرام' },
];

const faqs = [
  {
    q: 'قیمت و موجودی از کجا می‌آید؟',
    a: 'همیشه از پایگاه داده فروشگاه خودتان. مدل زبانی اجازه ندارد عددی بسازد؛ اگر داده‌ای در کاتالوگ نباشد، دستیار به‌جای حدس‌زدن، گفتگو را به شما ارجاع می‌دهد.',
  },
  {
    q: 'کاتالوگ فعلی من در اکسل است؛ وارد کردنش چقدر کار می‌برد؟',
    a: 'فایل CSV یا اکسل را بارگذاری می‌کنید و سیستم هر ردیف را جداگانه اعتبارسنجی می‌کند. ردیف‌های سالم ثبت می‌شوند و برای ردیف‌های دارای خطا، پیام دقیق همان ردیف برگردانده می‌شود تا اصلاح کنید.',
  },
  {
    q: 'محصولات چندتنوعی (رنگ و سایز) پشتیبانی می‌شوند؟',
    a: 'بله. هر محصول می‌تواند چند واریانت داشته باشد و موجودی هر واریانت جداگانه نگه‌داری می‌شود؛ دفتر گردش هم برای هر واریانت تاریخچه کامل دارد.',
  },
  {
    q: 'داده‌های فروشگاه من با بقیه قاطی نمی‌شود؟',
    a: 'هر رکورد به فروشگاه خودش قفل است و هر کوئری با شناسه فروشگاه فیلتر می‌شود. جداسازی داده در سطح دیتابیس اعمال می‌شود، نه فقط در رابط کاربری.',
  },
];

export default function LandingPage() {
  return (
    <div className="land">
      <nav className="land-nav">
        <div className="land-wrap land-nav-in">
          <Link className="brand" href="/">
            <span className="brand-mark"><IconLogo size={17} /></span>
            <span>
              <span className="brand-name" style={{ display: 'block' }}>فروش‌یار</span>
              <span className="brand-sub" style={{ display: 'block' }}>دستیار فروش فارسی</span>
            </span>
          </Link>
          <div className="land-links">
            <a href="#features">امکانات</a>
            <a href="#how">چطور کار می‌کند</a>
            <a href="#principles">اصول</a>
            <a href="#faq">پرسش‌ها</a>
          </div>
          <div className="land-nav-actions">
            <Link className="btn btn-ghost btn-sm" href="/login">ورود</Link>
            <span className="sep" />
            <Link className="btn btn-primary btn-sm" href="/login?mode=register">
              ساخت فروشگاه
              <IconArrowLeft size={14} />
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero — two columns, product window, gradient bleeding off-canvas */}
      <header className="land-hero">
        <div className="hero-mesh" aria-hidden="true" />
        <div className="land-wrap land-hero-in">
          <div>
            <span className="hero-badge">
              <span className="dot" />
              <b>کاتالوگ زنده</b> — قیمت و موجودی، بدون واسطه
            </span>
            <h1 className="hero-title">
              دستیاری که <em>قیمت و موجودی</em> را
              از کاتالوگ خودت می‌خواند
            </h1>
            <p className="hero-lead">
              فروش‌یار به سؤال‌های تکراری مشتری‌ها در تلگرام و اینستاگرام پاسخ می‌دهد،
              موجودی را دقیق نگه می‌دارد و هر جا مطمئن نبود، گفتگو را به شما می‌سپارد.
            </p>
            <div className="hero-actions">
              <Link className="btn btn-primary btn-lg" href="/login?mode=register">
                شروع رایگان
                <IconArrowLeft size={17} />
              </Link>
              <Link className="btn btn-ghost btn-lg" href="/login">
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
              <span className="url">forooshyar.ir/app</span>
            </div>
            <div className="mock-body">
              <div className="mock-side">
                <div className="mock-pill on" style={{ height: 18 }} />
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
                <div className="mock-card mock-msg">
                  <div className="k">آخرین گفتگو</div>
                  <div className="q" style={{ fontSize: 11, marginTop: 3 }}>«سلام، مانتو کتان سایز M موجوده؟»</div>
                  <div className="a" style={{ fontSize: 11 }}>بله، ۱۲ عدد موجود است — ۸۹۰٬۰۰۰ تومان</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* hairline facts strip */}
        <div className="land-facts">
          <div className="land-wrap">
            <div className="land-facts-in">
              {facts.map(fact => (
                <div className="fact" key={fact.l}>
                  <div className="fact-v">{fact.v}</div>
                  <div className="fact-l">{fact.l}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </header>

      {/* Features — 6-cell hairline grid */}
      <section className="land-section" id="features">
        <div className="land-wrap">
          <div className="sec-head">
            <div className="sec-eyebrow">امکانات</div>
            <h2 className="sec-title">
              هر چیزی که برای فروش دقیق لازم دارید،
              <br /><span className="cont">و هیچ‌چیز اضافه‌ای</span>
            </h2>
            <p className="sec-lead">
              پنل فروشنده فروش‌یار حول یک اصل ساخته شده: اطلاعات فروشگاه شما باید همیشه درست،
              به‌روز و قابل اعتماد باشد.
            </p>
          </div>
          <div className="feature-grid">
            {features.map(feature => (
              <article className="feature" key={feature.title}>
                <div className="feature-ico">{feature.icon}</div>
                <h3>{feature.title}</h3>
                <p>{feature.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Steps — numbered hairline cells */}
      <section className="land-section alt" id="how">
        <div className="land-wrap">
          <div className="sec-head">
            <div className="sec-eyebrow">شروع سریع</div>
            <h2 className="sec-title">سه قدم تا <span className="cont">اولین پاسخ خودکار</span></h2>
          </div>
          <div className="steps">
            {steps.map(step => (
              <div className="step" key={step.n}>
                <div className="n">{step.n}</div>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Dark inversion — exactly one per page */}
      <section className="land-dark" id="principles">
        <div className="land-wrap">
          <div className="dark-head">
            <div>
              <div className="sec-eyebrow">اصول طراحی</div>
              <h2 className="sec-title">
                چرا می‌توانید <span className="cont">به پاسخ‌ها اعتماد کنید</span>
              </h2>
            </div>
            <p className="sec-lead" style={{ maxWidth: 340, margin: 0 }}>
              سه قاعده‌ای که هیچ‌وقت نقض نمی‌شود؛ حتی وقتی پاسخ دادن سخت است.
            </p>
          </div>
          <div className="principles">
            {principles.map(principle => (
              <div className="principle" key={principle.title}>
                {principle.icon}
                <strong>{principle.title}</strong>
                <span>{principle.text}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="land-section" id="faq">
        <div className="land-wrap">
          <div className="sec-head">
            <div className="sec-eyebrow">پرسش‌ها</div>
            <h2 className="sec-title">چیزهایی که <span className="cont">زیاد پرسیده می‌شود</span></h2>
          </div>
          <div className="faq">
            {faqs.map((faq, index) => (
              <details key={faq.q} open={index === 0}>
                <summary>
                  {faq.q}
                  <span className="sign" aria-hidden="true" />
                </summary>
                <p>{faq.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="land-cta">
        <div className="orb" aria-hidden="true" />
        <div className="land-wrap land-cta-in">
          <h2>
            همین امروز کاتالوگ‌تان را وارد کنید،
            <br /><span className="cont">فردا پاسخ‌ها خودشان می‌آیند</span>
          </h2>
          <p>راه‌اندازی بدون تنظیمات پیچیده؛ اولین محصول را در چند دقیقه ثبت کنید و پاسخ‌های خودکار را ببینید.</p>
          <div className="land-cta-actions">
            <Link className="btn btn-primary btn-lg" href="/login?mode=register">
              ساخت فروشگاه
              <IconArrowLeft size={17} />
            </Link>
            <Link className="btn btn-outline btn-lg" href="/login">ورود به پنل</Link>
          </div>
        </div>
      </section>

      <footer className="land-footer">
        <div className="land-wrap">
          <div className="foot-cols">
            <div className="foot-brand">
              <Link className="brand" href="/">
                <span className="brand-mark"><IconLogo size={17} /></span>
                <span>
                  <span className="brand-name" style={{ display: 'block' }}>فروش‌یار</span>
                  <span className="brand-sub" style={{ display: 'block' }}>دستیار فروش فارسی</span>
                </span>
              </Link>
              <p>دستیار فروش فارسی برای فروشگاه‌هایی که قیمت و موجودی‌شان باید همیشه درست باشد.</p>
            </div>
            <div>
              <h4>محصول</h4>
              <ul>
                <li><a href="#features">امکانات</a></li>
                <li><a href="#how">چطور کار می‌کند</a></li>
                <li><a href="#principles">اصول طراحی</a></li>
                <li><a href="#faq">پرسش‌های متداول</a></li>
              </ul>
            </div>
            <div>
              <h4>پنل فروشنده</h4>
              <ul>
                <li><Link href="/login">ورود</Link></li>
                <li><Link href="/login?mode=register">ساخت فروشگاه</Link></li>
                <li><Link href="/app">داشبورد</Link></li>
                <li><Link href="/app/products">محصولات</Link></li>
              </ul>
            </div>
            <div>
              <h4>پشتیبانی</h4>
              <ul>
                <li><a href="#faq">راهنمای شروع</a></li>
                <li><a href="#faq">سؤال متداول</a></li>
                <li><Link href="/app/settings">تنظیمات فروشگاه</Link></li>
              </ul>
            </div>
          </div>
          <div className="foot-bottom">
            <span>© ۱۴۰۵ فروش‌یار — دستیار فروش فارسی</span>
            <div className="links">
              <a href="#faq">حریم خصوصی</a>
              <a href="#faq">شرایط استفاده</a>
              <a href="#faq">پشتیبانی</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
