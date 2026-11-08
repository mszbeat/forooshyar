import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { discover, looksLikeProductQuestion, matchCode, productCode } from '../src/catalog/discovery';
import { clarifyProducts, composeReply, describeProduct, orderButtons, productButtons } from '../src/telegram/brain';
import { applyInput, fullAddress, MAX_QUANTITY, normalizePhone, normalizePostalCode, promptFor, startDraft } from '../src/telegram/order-flow';
import { findCity, findProvince, PROVINCES } from '../src/geo/iran-geo';
import { detectIntents, MAX_CLARIFY_ROUNDS, needsHuman } from '../src/telegram/understanding';

/**
 * این تست‌ها به دیتابیس و تلگرام نیاز ندارند: منطق خالص تشخیص محصول و
 * حالت‌های سفارش است. اگر روزی قاعده‌ها عوض شوند، همین‌جا می‌شکند.
 */

const PRODUCTS = [
  { id: 'aaaaaa11-1111-1111-1111-111111111111', title: 'کت چرم مشکی', variants: [
    { id: 'v1', size: 'M', color: 'مشکی', price: 2_400_000, stock: 3 },
    { id: 'v2', size: 'L', color: 'مشکی', price: 2_400_000, stock: 0 },
  ] },
  { id: 'bbbbbb22-2222-2222-2222-222222222222', title: 'کت پشمی کرم', variants: [
    { id: 'v3', size: 'M', color: 'کرم', price: 1_800_000, stock: 5 },
  ] },
  { id: 'cccccc33-3333-3333-3333-333333333333', title: 'شال ابریشمی', variants: [
    { id: 'v4', size: '', color: 'زمردی', price: 1_250_000, stock: 2 },
  ] },
  { id: 'dddddd44-4444-4444-4444-444444444444', title: 'کیف چرم دستی', variants: [
    { id: 'v5', size: '', color: 'قهوه‌ای', price: 1_450_000, stock: 1 },
  ] },
];

const SHOP = {
  name: 'فروشگاه تست',
  shipping: 'ارسال با پست، ۲ تا ۴ روز کاری.',
  payment: 'پرداخت آنلاین یا کارت به کارت.',
  workingHours: 'هر روز ۹ تا ۱۸.',
  handoffMessage: 'برای پاسخ دقیق‌تر با فروشنده هماهنگ می‌کنم.',
};

describe('تشخیص محصول از حرف مشتری', () => {
  it('کد محصول دقیقاً همان محصول را می‌دهد', () => {
    const code = productCode(PRODUCTS[2].id);
    assert.equal(matchCode(`کد ${code}`, PRODUCTS)?.title, 'شال ابریشمی');
    assert.equal(matchCode(`#${code.toLowerCase()}`, PRODUCTS)?.title, 'شال ابریشمی');
  });

  it('«این کت چنده» دو کت را نامزد می‌کند، نه یکی را', () => {
    const result = discover('این کت چنده؟', PRODUCTS);
    assert.equal(result.kind, 'many');
    if (result.kind === 'many') {
      const titles = result.products.map(product => product.title);
      assert.deepEqual(titles.sort(), ['کت پشمی کرم', 'کت چرم مشکی']);
    }
  });

  it('«قیمت شال ابریشمی چنده» دقیقاً یک محصول است', () => {
    const result = discover('قیمت شال ابریشمی چنده', PRODUCTS);
    assert.equal(result.kind, 'single');
    if (result.kind === 'single') assert.equal(result.product.title, 'شال ابریشمی');
  });

  it('جمله‌ی ارسال و ساعت کاری محصول نامزد نمی‌کند', () => {
    assert.equal(discover('هزینه ارسال چنده؟', PRODUCTS).kind, 'none');
    assert.equal(discover('ساعت کاریتون؟', PRODUCTS).kind, 'none');
    assert.equal(discover('سلام', PRODUCTS).kind, 'none');
  });

  it('«قیمت کفش» همه‌ی کفش‌ها را نامزد می‌کند (باگ قدیمی: «کدام محصول؟»)', () => {
    const shoes = [
      { id: 'k1', title: 'کفش راحتی چرم مردانه', variants: [] },
      { id: 'k2', title: 'کفش ورزشی زنانه', variants: [] },
      { id: 'k3', title: 'کفش پیاده‌روی بچگانه', variants: [] },
      { id: 'k4', title: 'مانتو کتان', variants: [] },
    ] as never;
    const result = discover('قیمت کفش', shoes);
    assert.equal(result.kind, 'many');
    if (result.kind === 'many') {
      assert.equal(result.products.length, 3);
      assert.ok(result.products.every(product => product.title.includes('کفش')));
    }
  });

  it('عنوان دقیق یکتا → همان محصول', () => {
    const shoes = [
      { id: 'k1', title: 'کفش راحتی چرم مردانه', variants: [] },
      { id: 'k2', title: 'کفش ورزشی زنانه', variants: [] },
    ] as never;
    const result = discover('قیمت کفش ورزشی زنانه چنده؟', shoes);
    assert.equal(result.kind, 'single');
    if (result.kind === 'single') assert.equal(result.product.title, 'کفش ورزشی زنانه');
  });

  it('صفحه‌بندی فهرست: ۸ مورد در هر صفحه و همه‌ی محصولات قابل دسترس', () => {
    const many = Array.from({ length: 10 }, (_, index) => ({
      id: `s${index}`, title: `کفش مدل ${index}`, variants: [],
    })) as never;

    const first = clarifyProducts(many, 'قیمت کفش', 0);
    assert.equal(first.pageInfo?.total, 10);
    assert.equal(first.pageInfo?.pages, 2);
    // ۸ دکمه‌ی محصول + ردیف ناوبری
    assert.equal((first.buttons ?? []).length, 9);
    assert.deepEqual((first.buttons ?? []).at(-1)?.map(button => button.data), ['pg:1']);
    assert.doesNotMatch(first.text, /قبلی/);

    const second = clarifyProducts(many, 'قیمت کفش', 1);
    assert.equal((second.buttons ?? []).length, 3, '۲ محصول + ردیف ناوبری');
    assert.deepEqual((second.buttons ?? []).at(-1)?.map(button => button.data), ['pg:0']);
    assert.match(second.text, /صفحه‌ی ۲ از ۲/);

    // شماره‌گذاری پیوسته است تا مشتری بداند مورد نهم ادامه‌ی همان فهرست است.
    assert.match(second.text, /۹\. <b>کفش مدل 8<\/b>/);
    assert.match(second.text, /۱۰\. <b>کفش مدل 9<\/b>/);
  });

  it('تشخیص «سؤال محصولی» درست کار می‌کند', () => {
    assert.equal(looksLikeProductQuestion('این کت چنده'), true);
    assert.equal(looksLikeProductQuestion('سلام خوبید'), false);
  });
});

describe('پاسخ بات', () => {
  it('ابهام → لیست عمودی محصولات، هر محصول یک ردیف دکمه', () => {
    const reply = clarifyProducts(PRODUCTS.slice(0, 2), 'این کت چنده');
    assert.equal(reply.kind, 'clarify');
    assert.equal(reply.parseMode, 'HTML');
    assert.match(reply.text, /<code>[A-Z0-9]{6}<\/code>/, 'کد محصول باید با تگ code بیاید');
    assert.match(reply.text, /نام دقیق/);
    const buttons = reply.buttons ?? [];
    // چیدمان ستونی: هر محصول یک ردیف کامل، نه دو تا کنار هم.
    assert.equal(buttons.length, 2, 'دو محصول → دو ردیف');
    assert.ok(buttons.every(row => row.length === 1), 'هر ردیف فقط یک دکمه');
    assert.ok(buttons[0][0].data?.startsWith('p:'));
    // شماره‌ی ردیف در متن دکمه، تا با فهرست بالا جور باشد
    assert.match(buttons[0][0].text, /^1️⃣/);
    assert.match(buttons[1][0].text, /^2️⃣/);
  });

  it('یک محصول → قیمت همه‌ی سایزها و دکمه‌ی سفارش فقط برای موجودها', () => {
    const reply = describeProduct(PRODUCTS[0], 'قیمت کت چرم مشکی چنده');
    assert.match(reply.text, /سایز M/);
    assert.match(reply.text, /سایز L/);
    assert.match(reply.text, /ناموجود/);
    const rows = orderButtons(PRODUCTS[0]);
    assert.equal(rows.length, 1, 'فقط سایز M موجود است');
    assert.ok(rows[0][0].data?.startsWith('ord:'));
    assert.match(rows[0][0].text, /سفارش/);
  });

  it('سایز ناموجود → گزینه‌های واقعی نشان داده می‌شود، حدس زده نمی‌شود', () => {
    const reply = describeProduct(PRODUCTS[0], 'قیمت کت چرم مشکی سایز XL چنده');
    assert.equal(reply.kind, 'clarify');
    assert.match(reply.text, /XL/);
    assert.match(reply.text, /گزینه‌های ثبت‌شده/);
  });

  it('پرسش محصول + ارسال → درباره‌ی ارسال جواب می‌دهد', () => {
    const reply = composeReply('هزینه ارسال شال ابریشمی چنده؟', SHOP, PRODUCTS);
    assert.match(reply.text, /پست/);
  });

  it('کد محصول در جمله → همان محصول', () => {
    const reply = composeReply(`قیمت ${productCode(PRODUCTS[3].id)} چنده`, SHOP, PRODUCTS);
    assert.match(reply.text, /کیف چرم دستی/);
  });

  it('سؤال بی‌ربط → ارجاع به فروشنده (بدون حدس)', () => {
    const reply = composeReply('پولمو پس بدید', SHOP, PRODUCTS);
    assert.equal(reply.kind, 'handoff');
  });
});

describe('سفارش گام‌به‌گام', () => {
  const draft = startDraft({ productId: PRODUCTS[3].id, variantId: 'v5', title: 'کیف چرم دستی', spec: 'رنگ قهوه‌ای', price: 1_450_000, stock: 1 });

  it('شماره‌ی موبایل با فرمت‌های مختلف یکی می‌شود', () => {
    assert.equal(normalizePhone('۰۹۱۲۳۴۵۶۷۸۹'), '09123456789');
    assert.equal(normalizePhone('+98 912 345 6789'), '09123456789');
    assert.equal(normalizePhone('00989123456789'), '09123456789');
    assert.equal(normalizePhone('9123456789'), '09123456789');
    assert.equal(normalizePhone('12345'), null);
  });

  it('مسیر کامل: تعداد → نام → موبایل → استان → شهر → خیابان → کوچه → پلاک → واحد → کد پستی → تأیید', () => {
    let current = draft;
    let outcome = applyInput(current, { text: '2' });
    assert.equal(outcome.kind, 'invalid', 'موجودی ۱ عدد است، ۲ عدد نباید قبول شود');
    outcome = applyInput(current, { text: '1' });
    if (outcome.kind !== 'prompt') return assert.fail('تعداد باید قبول شود');
    assert.equal(outcome.draft.step, 'name');

    current = outcome.draft;
    outcome = applyInput(current, { text: 'علی رضایی' });
    if (outcome.kind !== 'prompt') return assert.fail('باید به مرحله‌ی موبایل برود');
    current = outcome.draft;
    assert.equal(current.step, 'phone');

    outcome = applyInput(current, { text: '۰۹۱۲۳۴۵۶۷۸۹' });
    if (outcome.kind !== 'prompt') return assert.fail('موبایل معتبر باید قبول شود');
    current = outcome.draft;
    assert.equal(current.step, 'province', 'بعد از موبایل نوبت استان است');
    // لیست استان‌ها با دکمه می‌آید و صفحه‌بندی دارد
    assert.ok((outcome.reply.buttons ?? []).length > 3);

    outcome = applyInput(current, { data: 'flow:prov:تهران' });
    if (outcome.kind !== 'prompt') return assert.fail('استان باید قبول شود');
    current = outcome.draft;
    assert.equal(current.province, 'تهران');
    assert.equal(current.step, 'city');
    assert.ok((outcome.reply.text).includes('تهران'));

    // شهر نادرست → همان مرحله تکرار می‌شود
    const wrongCity = applyInput(current, { data: 'flow:city:کرج' });
    assert.equal(wrongCity.kind, 'invalid', 'کرج در استان تهران نیست');

    outcome = applyInput(current, { data: 'flow:city:تهران' });
    if (outcome.kind !== 'prompt') return assert.fail('شهر باید قبول شود');
    current = outcome.draft;
    assert.equal(current.city, 'تهران');
    assert.equal(current.step, 'street');

    outcome = applyInput(current, { text: 'خیابان ولیعصر' });
    if (outcome.kind !== 'prompt') return assert.fail('خیابان باید قبول شود');
    current = outcome.draft;
    assert.equal(current.step, 'alley');

    outcome = applyInput(current, { data: 'flow:alley:none' });
    if (outcome.kind !== 'prompt') return assert.fail('«کوچه ندارد» باید قبول شود');
    current = outcome.draft;
    assert.equal(current.alley, 'ندارد');
    assert.equal(current.step, 'plaque');

    outcome = applyInput(current, { text: '۱۲' });
    if (outcome.kind !== 'prompt') return assert.fail('پلاک باید قبول شود');
    current = outcome.draft;
    assert.equal(current.plaque, '12', 'ارقام فارسی به لاتین تبدیل می‌شوند');
    assert.equal(current.step, 'unit');

    outcome = applyInput(current, { text: '۳' });
    if (outcome.kind !== 'prompt') return assert.fail('واحد باید قبول شود');
    current = outcome.draft;
    assert.equal(current.step, 'postal');

    // کد پستی نادرست
    assert.equal(applyInput(current, { text: '123' }).kind, 'invalid');
    outcome = applyInput(current, { text: '۱۲۳۴۵۶۷۸۹۰' });
    if (outcome.kind !== 'prompt') return assert.fail('کد پستی معتبر باید قبول شود');
    current = outcome.draft;
    assert.equal(current.postalCode, '1234567890');
    assert.equal(current.step, 'confirm');
    assert.match(promptFor(current).text, /پیش‌فاکتور/);
    assert.match(promptFor(current).text, /خیابان ولیعصر/);

    const ready = applyInput(current, { data: 'flow:confirm' });
    assert.equal(ready.kind, 'ready');
    if (ready.kind === 'ready') {
      assert.equal(ready.draft.quantity, 1);
      assert.equal(ready.draft.phone, '09123456789');
      assert.equal(fullAddress(ready.draft), 'تهران، تهران، خیابان ولیعصر، پلاک 12، واحد 3');
    }
  });

  it('کد پستی اختیاری است و با دکمه رد می‌شود', () => {
    const postalStep = { ...draft, step: 'postal' as const, quantity: 1, name: 'علی', phone: '09123456789', province: 'تهران', city: 'تهران', street: 'ولیعصر', alley: 'ندارد', plaque: '12' };
    const outcome = applyInput(postalStep, { data: 'flow:postal:skip' });
    assert.equal(outcome.kind, 'prompt');
    if (outcome.kind === 'prompt') {
      assert.equal(outcome.draft.step, 'confirm');
      assert.equal(outcome.draft.postalCode, undefined);
      assert.match(outcome.reply.text, /کد پستی: ندارد/);
    }
  });

  it('دکمه‌ی بازگشت مرحله را عقب می‌برد و مقدار را پاک می‌کند', () => {
    const atPlaque = { ...draft, step: 'plaque' as const, quantity: 1, name: 'علی', phone: '09123456789', province: 'تهران', city: 'تهران', street: 'ولیعصر', alley: 'گلستان' };
    const back = applyInput(atPlaque, { data: 'flow:back' });
    assert.equal(back.kind, 'prompt');
    if (back.kind === 'prompt') {
      assert.equal(back.draft.step, 'alley');
      assert.equal(back.draft.alley, undefined, 'مقدار مرحله‌ی فعلی پاک می‌شود');
    }
  });

  it('صفحه‌بندی استان‌ها و شهرها', () => {
    const provinceStep = { ...draft, step: 'province' as const, quantity: 1 };
    const page2 = applyInput(provinceStep, { data: 'flow:provpage:2' });
    assert.equal(page2.kind, 'prompt');
    if (page2.kind === 'prompt') {
      assert.equal(page2.draft.page, 2);
      assert.match(page2.reply.text, /صفحه ۳ از/);
    }

    // شهر با تایپ هم قبول است، نه فقط با دکمه
    const cityStep = { ...draft, step: 'city' as const, quantity: 1, province: 'فارس', page: 0 };
    const typed = applyInput(cityStep, { text: 'شیراز' });
    assert.equal(typed.kind, 'prompt');
    if (typed.kind === 'prompt') assert.equal(typed.draft.city, 'شیراز');

    // نیم‌فاصله و «ي/ك» عربی نباید مانع شود
    const arabic = applyInput({ ...cityStep, province: 'خراسان رضوی' }, { text: 'مشهد' });
    assert.equal(arabic.kind, 'prompt');
  });

  it('ورودی نامعتبر از جریان بیرون نمی‌اندازد', () => {
    const phoneStep = { ...draft, step: 'phone' as const, quantity: 1, name: 'علی' };
    const outcome = applyInput(phoneStep, { text: 'سلام' });
    assert.equal(outcome.kind, 'invalid');
    if (outcome.kind === 'invalid') assert.equal(outcome.draft.step, 'phone');
  });

  it('لغو در هر مرحله', () => {
    assert.equal(applyInput({ ...draft, step: 'confirm', quantity: 1 }, { data: 'flow:cancel' }).kind, 'cancel');
    assert.equal(applyInput({ ...draft, step: 'address', quantity: 1 }, { text: 'لغو' }).kind, 'cancel');
  });

  it('دکمه‌های تعداد بیش از موجودی نمایش داده نمی‌شوند', () => {
    const prompt = promptFor(draft);
    const buttons = (prompt.buttons ?? []).flat().map(button => button.data);
    assert.ok(buttons.includes('flow:q:1'));
    assert.ok(!buttons.includes('flow:q:2'), 'موجودی ۱ است');
    assert.equal(MAX_QUANTITY, 10);
  });

  it('نام از تلگرام با دکمه', () => {
    const step = { ...draft, step: 'name' as const, quantity: 1 };
    const outcome = applyInput(step, { data: 'flow:name:self', telegramName: 'سارا' });
    assert.equal(outcome.kind, 'prompt');
    if (outcome.kind === 'prompt') {
      assert.equal(outcome.draft.name, 'سارا');
      assert.equal(outcome.draft.step, 'phone');
    }
  });
});

describe('داده‌ی استان و شهر', () => {
  it('۳۱ استان و مرکز هر استان در فهرست شهرهایش هست', () => {
    assert.equal(PROVINCES.length, 31);
    for (const province of PROVINCES) {
      assert.ok(province.cities.length > 0, `${province.name} شهر ندارد`);
      assert.equal(province.cities[0], province.capital, `مرکز ${province.name} باید اول باشد`);
      assert.ok(findCity(province.name, province.capital), `${province.capital} در فهرست نیست`);
    }
  });

  it('نام استان با نیم‌فاصله/حرف عربی هم پیدا می‌شود', () => {
    assert.ok(findProvince('تهران'));
    assert.ok(findProvince('كهگيلويه و بويراحمد'), 'حروف عربی باید نرمال شوند');
    assert.equal(findCity('تهران', 'کرج'), undefined, 'کرج در تهران نیست');
    assert.equal(findCity('البرز', 'کرج'), 'کرج');
  });

  it('کد پستی: ۱۰ رقم و بدون صفر ابتدایی', () => {
    assert.equal(normalizePostalCode('۱۲۳۴۵۶۷۸۹۰'), '1234567890');
    assert.equal(normalizePostalCode('0123456789'), null);
    assert.equal(normalizePostalCode('12345'), null);
  });
});


/**
 * فهم «منظور» مشتری.
 *
 * این تست‌ها از دو ایراد واقعی آمده‌اند: «قیمت چند؟» بدون نام محصول فوری به
 * فروشنده ارجاع داده می‌شد، و «تایم کاری» جواب نمی‌گرفت در حالی که
 * «ساعت کاری» جواب می‌گرفت.
 */
describe('فهم پیام فارسی', () => {
  const shop = {
    name: 'بوتیک', tone: '',
    shipping: 'ارسال با پست پیشتاز، ۲ تا ۴ روز کاری.',
    payment: 'پرداخت آنلاین یا کارت‌به‌کارت.',
    workingHours: 'هر روز از ساعت ۹:۰۰ تا ۲۳:۰۰.',
    returns: 'تا ۷ روز، اگر برچسب نخورده باشد.',
    handoffMessage: 'همکارم تماس می‌گیرد.',
  };

  const products = [{
    id: 'p1', title: 'مانتو کتان', description: '', category: 'مانتو', active: true,
    variants: [
      { id: 'v1', size: '۳۸', color: 'کرم', price: 640000, stock: 3, active: true },
      { id: 'v2', size: '۴۰', color: 'مشکی', price: 690000, stock: 0, active: true },
    ],
  }] as never;

  it('«تایم کاری» و «ساعت کاری» یک پاسخ می‌گیرند', () => {
    const a = composeReply('ساعت کاری', shop as never, products);
    const b = composeReply('تایم کاری', shop as never, products);
    const c = composeReply('ساعت کاریتون چنده؟', shop as never, products);
    assert.equal(a.text, b.text);
    assert.equal(a.kind, 'answer');
    assert.match(c.text, /۹:۰۰/, 'پسوند «تون/چنده» نباید معنی را عوض کند');
    assert.doesNotMatch(c.text, /کدام محصول/);
  });

  it('«قیمت چند؟» بدون نام محصول → سؤال با دکمه، نه ارجاع', () => {
    const reply = composeReply('قیمت چند؟', shop as never, products);
    assert.equal(reply.kind, 'clarify');
    assert.match(reply.text, /کدام محصول/);
    assert.ok(reply.buttons?.length, 'باید دکمه‌ی محصول‌ها را نشان دهد');
  });

  it('موضوع‌های مختلف با عبارت‌های مختلف یک پاسخ می‌گیرند', () => {
    const pairs: [string, string][] = [
      ['هزینه ارسال چقدره', 'پست چطوره'],
      ['کارت به کارت قبول می‌کنید', 'چطور پرداخت کنم'],
      ['مرجوعی دارید؟', 'می‌تونم تعویض کنم'],
    ];
    for (const [first, second] of pairs) {
      const a = composeReply(first, shop as never, products);
      const b = composeReply(second, shop as never, products);
      assert.equal(a.kind, 'answer', first);
      assert.equal(b.kind, 'answer', second);
      assert.equal(a.text, b.text, `${first} و ${second} باید یک جواب بگیرند`);
    }
  });

  it('دو موضوع در یک پیام → هر دو جواب می‌گیرند (نه ارجاع)', () => {
    const reply = composeReply('مانتو کتان قیمتش چنده و چند روزه می‌رسه؟', shop as never, products);
    assert.match(reply.text, /۶۴۰٬۰۰۰|640/);
    assert.match(reply.text, /پست پیشتاز/);
  });

  it('شکایت و درخواست آدم واقعی همان لحظه به انسان می‌رسد', () => {
    assert.equal(needsHuman(detectIntents('این خیلی افتضاح بود')), true);
    assert.equal(composeReply('می‌شه با مدیر صحبت کنم؟', shop as never, products).kind, 'handoff');
  });

  it('مرجوعی وقتی فروشنده سیاستش را پر کرده، خودِ بات جواب می‌دهد', () => {
    const reply = composeReply('می‌خوام مرجوع کنم', shop as never, products);
    assert.equal(reply.kind, 'answer');
    assert.match(reply.text, /۷ روز/);
  });

  it('نامفهوم: اول سؤال، آخرین بار ارجاع', () => {
    for (let round = 0; round < MAX_CLARIFY_ROUNDS; round += 1) {
      const reply = composeReply('بلابلا زیرو', shop as never, products, { round });
      assert.equal(reply.kind, 'clarify', `دور ${round + 1}`);
      assert.ok(reply.buttons?.length);
    }
    const last = composeReply('بلابلا زیرو', shop as never, products, { round: MAX_CLARIFY_ROUNDS });
    assert.equal(last.kind, 'handoff');
  });

  it('سلام و تشکر جواب مهربان می‌گیرند، نه ارجاع', () => {
    assert.equal(composeReply('سلام', shop as never, products).kind, 'answer');
    assert.equal(composeReply('ممنون از راهنماییت', shop as never, products).kind, 'answer');
  });
});
