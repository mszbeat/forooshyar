'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import './landing.css';
import './grain-landing.css';
import {
  IconArrowLeft, IconBolt, IconChat, IconCheckCircle, IconPackage,
  IconShield, IconSparkles, IconStore, IconTrendUp, IconUpload, IconClock,
} from '@/components/icons';
import { ThemeToggle } from '@/components/theme';

const facts = [
  { v: '۱۱ مرحله', l: 'سفارش‌گیری مرحله‌به‌مرحله در بات' },
  { v: '۰', l: 'حدس در قیمت و موجودی' },
  { v: '۳۱ استان', l: 'نشانی ساخت‌یافته، ۱۲۱۲ شهر' },
  { v: '۲۴ ساعته', l: 'پاسخ بدون خستگی' },
];

const before = [
  'مشتری می‌پرسد «قیمتش چنده؟» و تا شب بی‌جواب می‌ماند — یا جواب اشتباه می‌گیرد.',
  'موجودی اکسل با واقعیت نمی‌خواند و دو نفر آخرین عدد را می‌خرند.',
  'سؤال تکراری «ارسال چند روزه است؟» ده بار در روز جواب داده می‌شود.',
  'ربات‌های منویی هر جمله‌ی متفاوت را «نمی‌فهمند» و مشتری را می‌پروند.',
];

const after = [
  '«قیمتش چنده؟» در همان لحظه از کاتالوگ خودت جواب می‌گیرد؛ اگر مبهم بود، بات با دکمه می‌پرسد «کدام محصول؟».',
  'موجودی هنگام ثبت سفارش رزرو می‌شود؛ سفارش پرداخت‌نشده بعد از ۲۴ ساعت آزاد می‌شود.',
  'ارسال، پرداخت، ساعت کاری و مرجوعی یک‌بار در تنظیمات نوشته می‌شود، بعد بات هر بار همان را می‌گوید.',
  '«تایم کاری» و «ساعت کاری» یک جواب می‌گیرند؛ فقط اگر واقعاً نفهمید، بعد از چند سؤال به تو وصل می‌شود.',
];

const steps = [
  {
    n: '۰۱',
    title: 'فروشگاه را بساز',
    text: 'نام، لحن، شرایط ارسال، پرداخت، ساعت کاری و سیاست مرجوعی را یک‌بار می‌نویسی. همین‌ها می‌شود دانشِ بات.',
    mini: 'کمتر از ۵ دقیقه',
  },
  {
    n: '۰۲',
    title: 'کاتالوگ را وارد کن',
    text: 'دستی اضافه کن یا فایل اکسل/CSV را بارگذاری کن. هر ردیف جدا اعتبارسنجی می‌شود و خطای همان ردیف را می‌بینی.',
    mini: 'اکسل، CSV یا دستی',
  },
  {
    n: '۰۳',
    title: 'بات را به تلگرام وصل کن',
    text: 'توکن بات را می‌گذاری، webhook از سرور خودمان ثبت می‌شود و لینک اختصاصی فروشگاه آماده است.',
    mini: 'یک کلیک برای ثبت webhook',
  },
  {
    n: '۰۴',
    title: 'سفارش‌ها را از پنل جلو ببر',
    text: 'هر سفارش با نشانی ساخت‌یافته، لینک پرداخت و گفتگو با مشتری در یک صفحه. همان‌جا جواب می‌دهی، همان‌جا می‌فرستی.',
    mini: 'پنل سفارش + گفتگو',
  },
];

const faqs = [
  {
    q: 'اگر بات منظورش را نفهمد چه می‌شود؟',
    a: 'اول با یک سؤال روشن‌کننده و چند دکمه («قیمت و موجودی»، «ارسال»، «پرداخت»، «ساعت کاری») از مشتری می‌خواهد دقیق‌تر بگوید. اگر بعد از چند بار تلاش هم روشن نشد، مکالمه با متن کامل و چند پیام آخر به تو ارجاع داده می‌شود. یعنی هیچ‌وقت «سریع به بن‌بست» نمی‌خورد.',
  },
  {
    q: 'قیمت و موجودی از کجا می‌آید؟',
    a: 'همیشه از پایگاه داده فروشگاه خودت. هیچ عددی از مدل زبانی ساخته نمی‌شود؛ اگر داده‌ای در کاتالوگ نباشد، بات حدس نمی‌زند.',
  },
  {
    q: '«تایم کاری» و «ساعت کاری» فرق دارند؟',
    a: 'برای بات نه. جمله‌ها با ریشه‌ی کلمه‌ها و معادل‌های محاوره‌ای سنجیده می‌شوند، پس «تایم کاری»، «ساعت کاریتون چنده» و «تا کی بازید» یک جواب می‌گیرند.',
  },
  {
    q: 'می‌توانم از داخل بات به مشتری پیام بدهم؟',
    a: 'بله. روی اعلان همان مکالمه «پاسخ» می‌زنی، یا از پنل → سفارش‌ها → جزئیات، در کادر گفتگو می‌نویسی. هر دو مسیر یکی است و پیام در تاریخچه ثبت می‌شود.',
  },
  {
    q: 'داده‌های فروشگاه من با بقیه قاطی نمی‌شود؟',
    a: 'هر رکورد به فروشگاه خودش قفل است و هر کوئری با شناسه‌ی فروشگاه فیلتر می‌شود؛ جداسازی در سطح دیتابیس اعمال می‌شود، نه فقط در رابط کاربری.',
  },
];

const bento = [
  {
    cls: 'wide dark',
    icon: <IconSparkles />,
    title: 'منظور را می‌فهمد، نه کلمه را',
    text: 'جمله‌های محاوره‌ای، غلط تایپی، عربی/فارسی و نیم‌فاصله فرقی نمی‌کند. بات مفهوم را تشخیص می‌دهد و اگر چند موضوع در یک جمله بود، به همه جواب می‌دهد.',
    sample: (
      <>
        <b>مشتری:</b> سلام تایم کاریتون چنده و قیمت مانتو کتان چند؟
        <br />
        <b>بات:</b> 🕒 هر روز ۹ تا ۲۳ · 🛍 مانتو کتان از ۶۴۰٬۰۰۰ تومان
      </>
    ),
  },
  {
    cls: '',
    icon: <IconPackage />,
    title: 'موجودی و دفتر گردش',
    text: 'هر فروش، شارژ و اصلاح، اتمیک ثبت می‌شود؛ موجودی هیچ‌وقت منفی نمی‌شود.',
  },
  {
    cls: '',
    icon: <IconUpload />,
    title: 'ورود گروهی کاتالوگ',
    text: 'اکسل یا CSV؛ خطای هر ردیف جدا برگردانده می‌شود.',
  },
  {
    cls: '',
    icon: <IconChat />,
    title: 'گفتگو با مشتری',
    text: 'تاریخچه‌ی پیام‌ها و کادر پاسخ، هم در بات هم در پنل.',
  },
  {
    cls: '',
    icon: <IconBolt />,
    title: 'سفارش‌گیری در خود بات',
    text: '۱۱ مرحله با نوار پیشرفت، استان و شهر دکمه‌ای، نشانی ساخت‌یافته.',
  },
];

export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="land">
      <nav className={`land-nav ${scrolled ? 'scrolled' : ''}`}>
        <div className="land-wrap land-nav-in">
          <Link className="brand" href="/">
            <span className="brand-mark"><Image src="/brand/robot-face-mark.png" alt="" width={30} height={30} priority style={{ width: 30, height: 30, objectFit: 'contain' }} /></span>
            <span>
              <span className="brand-name" style={{ display: 'block' }}>فروش‌یار</span>
              <span className="brand-sub" style={{ display: 'block' }}>دستیار فروش فارسی</span>
            </span>
          </Link>
          <div className="land-links">
            <a href="#problem">چرا</a>
            <a href="#features">امکانات</a>
            <a href="#how">چطور کار می‌کند</a>
            <a href="#rules">اصول</a>
            <a href="#faq">پرسش‌ها</a>
          </div>
          <div className="land-nav-actions">
            <ThemeToggle />
            <Link className="btn btn-ghost btn-sm" href="/login">ورود</Link>
            <span className="sep" />
            <Link className="btn btn-primary btn-sm" href="/login?mode=register">
              ساخت فروشگاه
              <IconArrowLeft size={14} />
            </Link>
          </div>
        </div>
      </nav>

      {/* ------------------------------------------------------------- هیرو */}
      <header className="hero">
        <div className="land-wrap hero-grid">
          <div>
            <span className="hero-badge">
              <span className="pill"><span className="dot" /> کاتالوگ زنده</span>
              قیمت از دیتابیس خودت
            </span>

            <h1 className="hero-title">
              مشتری می‌پرسد،
              <br />
              <span className="ink mark">فروش‌یار</span> جواب می‌دهد
              <br />
              <span className="quiet">با عددِ واقعی</span>
            </h1>

            <p className="hero-lead">
              دستیار فروش فارسی برای تلگرام: سؤال قیمت، موجودی، ارسال، پرداخت و مرجوعی را
              از دانش فروشگاه خودت جواب می‌دهد، سفارش را تا مرحله‌ی پرداخت می‌برد و هر جا
              واقعاً لازم بود، تحویل خودت می‌دهد.
            </p>

            <div className="hero-actions">
              <Link className="btn btn-primary btn-lg" href="/login?mode=register">
                شروع رایگان
                <IconArrowLeft size={17} />
              </Link>
              <Link className="btn btn-outline btn-lg" href="/login">ورود به پنل</Link>
            </div>

            <div className="hero-proof">
              <span><IconCheckCircle size={15} /> بدون کارت بانکی</span>
              <span><IconClock size={15} /> پاسخ در همان لحظه</span>
              <span><IconShield size={15} /> داده‌ی هر فروشگاه جدا</span>
            </div>
          </div>

          {/* نمونه‌ی گفتگو با متن واقعی بات */}
          <div className="stage">
            <div className="stage-glow" aria-hidden="true" />
            <div className="float-card a">
              <span className="ico-box"><IconTrendUp size={14} /></span>
              <span>پاسخ از کاتالوگ<b>موجودی: ۳ عدد</b></span>
            </div>
            <div className="float-card b">
              <span className="ico-box"><IconCheckCircle size={14} /></span>
              <span>سفارش ثبت شد<b>لینک پرداخت آماده است</b></span>
            </div>

            <div className="phone" aria-hidden="true">
              <div className="phone-screen">
                <div className="phone-head">
                  <span className="ava">ب</span>
                  <span>
                    <span className="nm">بوتیک باران</span>
                    <span className="st">آنلاین · پاسخ خودکار</span>
                  </span>
                </div>
                <div className="phone-body">
                  <div className="msg user">سلام، تایم کاریتون چنده؟</div>
                  <div className="msg bot">
                    <div>🕒 هر روز از ساعت ۹:۰۰ تا ۲۳:۰۰.</div>
                    <div className="meta">همین حالا</div>
                  </div>
                  <div className="msg user">مانتو کتان قیمتش چنده؟</div>
                  <div className="msg bot">
                    <div className="t">🛍 مانتو کتان</div>
                    <div className="row-line"><span className="k">سایز ۳۸، رنگ کرم</span></div>
                    <div className="price">۶۴۰٬۰۰۰ تومان · ۳ عدد موجود</div>
                    <div className="chiprow">
                      <span className="tg-btn">🛒 سفارش · سایز ۳۸، رنگ کرم</span>
                    </div>
                    <div className="meta">همین حالا</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="fact-strip">
          <div className="land-wrap">
            <div className="fact-strip-in">
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

      {/* ------------------------------------------------------------ مشکل */}
      <section className="sec" id="problem">
        <div className="land-wrap">
          <div className="sec-head center">
            <span className="eyebrow">تفاوت واقعی</span>
            <h2 className="sec-title">
              فروشنده‌ها با پیام‌های تکراری
              <br />
              <span className="dim">نمی‌جنگند</span>
            </h2>
            <p className="sec-lead">
              مشکل «جواب دادن» نیست؛ مشکل این است که جواب باید همیشه درست، به‌روز و با
              لحن خودت باشد. این دو ستون همان تفاوت است.
            </p>
          </div>

          <div className="compare">
            <div className="compare-col before">
              <h3><span className="tag">بدون فروش‌یار</span></h3>
              <ul className="compare-list">
                {before.map(item => (
                  <li key={item}><span className="mk">×</span><span>{item}</span></li>
                ))}
              </ul>
            </div>
            <div className="compare-col after">
              <h3><span className="tag">با فروش‌یار</span></h3>
              <ul className="compare-list">
                {after.map(item => (
                  <li key={item}><span className="mk">✓</span><span>{item}</span></li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- امکانات */}
      <section className="sec alt" id="features">
        <div className="land-wrap">
          <div className="sec-head">
            <span className="eyebrow">امکانات</span>
            <h2 className="sec-title">
              یک فروشنده‌ی تمام‌وقت
              <br />
              <span className="dim">که حقوق نمی‌خواهد</span>
            </h2>
            <p className="sec-lead">
              هر قابلیت از یک نیاز واقعی آمده: کمتر پرسیدن از مشتری، کمتر حدس زدن، و
              سفارشی که تا آخر بسته می‌شود.
            </p>
          </div>

          <div className="bento">
            {bento.map(tile => (
              <article className={`tile ${tile.cls}`} key={tile.title}>
                <div className="tile-ico">{tile.icon}</div>
                <h3>{tile.title}</h3>
                <p className="tile-text">{tile.text}</p>
                {tile.sample && <div className="tile-sample">{tile.sample}</div>}
              </article>
            ))}

            <article className="tile span-3">
              <div className="tile-ico"><IconStore /></div>
              <h3>پنل تصمیم‌گیری</h3>
              <p className="tile-text">
                فروش امروز، ارزش انبار، کم‌موجودها و موجودی کهنه — همه در یک صفحه.
              </p>
            </article>
            <article className="tile span-3">
              <div className="tile-ico"><IconShield /></div>
              <h3>تست پاسخ قبل از انتشار</h3>
              <p className="tile-text">
                گفتگوی آزمایشی داخل پنل: ببین بات چه می‌گوید و کجا کار را به تو می‌سپارد.
              </p>
            </article>
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------------- مسیر */}
      <section className="sec" id="how">
        <div className="land-wrap">
          <div className="sec-head">
            <span className="eyebrow">شروع</span>
            <h2 className="sec-title">
              از صفر تا اولین سفارش،
              <br />
              <span className="dim">در چهار قدم</span>
            </h2>
          </div>

          <div className="flow">
            {steps.map(step => (
              <div className="flow-step" key={step.n}>
                <div className="flow-n">{step.n}</div>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.text}</p>
                  <span className="mini">{step.mini}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- اصول */}
      <section className="night-sec" id="rules">
        <div className="land-wrap">
          <div className="sec-head">
            <span className="eyebrow">اصول</span>
            <h2 className="sec-title">سه قاعده‌ای که نقض نمی‌شود</h2>
            <p className="sec-lead">
              وقتی پاسخ دادن سخت است، همین سه قاعده تعیین می‌کنند بات چه کار کند.
            </p>
          </div>

          <div className="rules">
            <div className="rule">
              <div className="n">۰۱</div>
              <h3>قیمت فقط از دیتابیس</h3>
              <p>هیچ عددی ساخته نمی‌شود. منبع قیمت و موجودی، کاتالوگ خودت است.</p>
            </div>
            <div className="rule">
              <div className="n">۰۲</div>
              <h3>اول می‌پرسد، بعد ارجاع می‌دهد</h3>
              <p>ابهام با سؤال و دکمه حل می‌شود؛ ارجاع به انسان آخرین راه است، نه اولین.</p>
            </div>
            <div className="rule">
              <div className="n">۰۳</div>
              <h3>دیوار بین فروشگاه‌ها</h3>
              <p>هر کوئری با شناسه‌ی فروشگاه فیلتر می‌شود؛ داده‌ها در سطح دیتابیس جدا هستند.</p>
            </div>
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------- پرسش‌ها */}
      <section className="sec" id="faq">
        <div className="land-wrap">
          <div className="sec-head">
            <span className="eyebrow">پرسش‌ها</span>
            <h2 className="sec-title">چیزهایی که <span className="dim">زیاد پرسیده می‌شود</span></h2>
          </div>
          <div className="faq">
            {faqs.map((faq, index) => (
              <details key={faq.q} open={openFaq === index}>
                <summary onClick={event => { event.preventDefault(); setOpenFaq(current => current === index ? null : index); }}>
                  {faq.q}
                  <span className="sign" aria-hidden="true" />
                </summary>
                <p>{faq.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- CTA */}
      <section className="land-wrap" style={{ paddingBottom: 8 }}>
        <div className="cta">
          <div className="cta-in">
            <div>
              <h2>
                امشب راحت بخواب،
                <br />
                پیام‌ها فردا هم جواب دارند
              </h2>
              <p>
                کاتالوگت را وارد کن، دانش فروشگاهت را بنویس و لینک بات را بگذار.
                اولین پاسخ خودکار چند دقیقه بعد آماده است.
              </p>
            </div>
            <div className="cta-actions">
              <Link className="btn btn-on-dark btn-lg" href="/login?mode=register">
                ساخت فروشگاه
                <IconArrowLeft size={17} />
              </Link>
              <Link className="btn btn-ghost btn-lg" href="/login">ورود به پنل</Link>
            </div>
          </div>
        </div>
      </section>

      <footer className="foot">
        <div className="land-wrap">
          <div className="foot-cols">
            <div className="foot-brand">
              <Link className="brand" href="/">
                <span className="brand-mark"><Image src="/brand/robot-face-mark.png" alt="" width={30} height={30} priority style={{ width: 30, height: 30, objectFit: 'contain' }} /></span>
                <span>
                  <span className="brand-name" style={{ display: 'block' }}>فروش‌یار</span>
                  <span className="brand-sub" style={{ display: 'block' }}>دستیار فروش فارسی</span>
                </span>
              </Link>
              <p>
                دستیار فروش فارسی برای فروشگاه‌هایی که قیمت و موجودی‌شان باید
                همیشه درست باشد.
              </p>
            </div>
            <div>
              <h4>محصول</h4>
              <ul>
                <li><a href="#problem">چرا فروش‌یار</a></li>
                <li><a href="#features">امکانات</a></li>
                <li><a href="#how">چطور کار می‌کند</a></li>
                <li><a href="#rules">اصول</a></li>
              </ul>
            </div>
            <div>
              <h4>پنل فروشنده</h4>
              <ul>
                <li><Link href="/login">ورود</Link></li>
                <li><Link href="/login?mode=register">ساخت فروشگاه</Link></li>
                <li><Link href="/app">داشبورد</Link></li>
                <li><Link href="/app/orders">سفارش‌ها</Link></li>
              </ul>
            </div>
            <div>
              <h4>راهنما</h4>
              <ul>
                <li><a href="#faq">پرسش‌های متداول</a></li>
                <li><Link href="/app/assistant">تست پاسخ بات</Link></li>
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
