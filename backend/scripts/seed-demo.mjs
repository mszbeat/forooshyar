// Seeds a demo shop with a realistic Persian catalog so the panel can be
// reviewed without typing data by hand. Safe to run more than once: the
// catalog is only inserted when the shop has no products yet.
const BASE = process.env.API_BASE_URL || process.env.API || 'http://127.0.0.1:3001';

async function req(path, { method = 'GET', body, token, headers = {} } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text.slice(0, 300)}`);
  return data;
}

const EMAIL = process.env.DEMO_EMAIL || 'demo@forooshyar.ir';
const PASSWORD = process.env.DEMO_PASSWORD || 'forooshyar-demo-1404';

const catalog = [
  { title: 'مانتو کتان تابستانه', category: 'مانتو', description: 'پارچه کتان نخی، برش آزاد، آستر ساتن.', variants: [
    { size: 'M', color: 'کرم', price: 890000, stock: 12, sku: 'MN-KTN-M-KRM' },
    { size: 'L', color: 'مشکی', price: 890000, stock: 3, sku: 'MN-KTN-L-MSH' },
    { size: 'XL', color: 'کرم', price: 920000, stock: 0, sku: 'MN-KTN-XL-KRM' },
  ]},
  { title: 'شومیز ابریشمی یقه گرد', category: 'شومیز', description: 'ابریشم مصنوعی درجه یک با دوخت تمیز.', variants: [
    { size: 'S', color: 'سفید', price: 1250000, stock: 5, sku: 'SH-ABR-S-SFD' },
    { size: 'M', color: 'سفید', price: 1250000, stock: 0, sku: 'SH-ABR-M-SFD' },
  ]},
  { title: 'کیف چرم دست‌دوز', category: 'کیف', description: 'چرم طبیعی، آستر پارچه‌ای، بند بلند.', variants: [
    { size: '', color: 'قهوه‌ای', price: 2450000, stock: 2, sku: 'KF-CHR-BRN' },
  ]},
  { title: 'شال نخی طرح‌دار', category: 'شال', description: 'نخ پنبه، ابعاد ۱۸۰×۷۰ سانتی‌متر.', variants: [
    { size: '', color: 'فیروزه‌ای', price: 450000, stock: 25, sku: 'SHL-NKH-FRZ' },
    { size: '', color: 'زرشکی', price: 450000, stock: 1, sku: 'SHL-NKH-ZRSH' },
  ]},
  { title: 'کت بلند پاییزه', category: 'کت', description: 'فوتر دو لایه، جیب مخفی.', variants: [
    { size: 'M', color: 'خاکستری', price: 1890000, stock: 0, sku: 'KT-BLN-M-KHK' },
    { size: 'L', color: 'خاکستری', price: 1890000, stock: 6, sku: 'KT-BLN-L-KHK' },
  ]},
  { title: 'دامن پلیسه میدی', category: 'دامن', description: 'پلیسه حرارتی، کمر کشی.', variants: [
    { size: 'S', color: 'مشکی', price: 760000, stock: 9, sku: 'DM-PLS-S-MSH' },
    { size: 'M', color: 'مشکی', price: 760000, stock: 4, sku: 'DM-PLS-M-MSH' },
  ]},
  { title: 'ست ورزشی زنانه', category: 'ورزشی', description: 'پارچه مکرافیت، خنک و کشسان.', variants: [
    { size: 'M', color: 'صورتی', price: 1180000, stock: 7, sku: 'ST-VRZ-M-SRT' },
    { size: 'L', color: 'مشکی', price: 1180000, stock: 2, sku: 'ST-VRZ-L-MSH' },
  ]},
  { title: 'پیراهن خواب ساتن', category: 'لباس خواب', description: 'ساتن نرم با بسته‌بندی هدیه.', variants: [
    { size: 'S', color: 'یاسی', price: 690000, stock: 14, sku: 'PR-KHB-S-YAS' },
  ]},
];

async function main() {
  let token;
  try {
    const login = await req('/auth/login', { method: 'POST', body: { email: EMAIL, password: PASSWORD } });
    token = login.accessToken;
    console.log('logged in');
  } catch {
    const reg = await req('/auth/register', { method: 'POST', body: { email: EMAIL, password: PASSWORD, shopName: 'بوتیک نیلا' } });
    token = reg.accessToken;
    console.log('registered');
  }

  await req('/shop', { method: 'PATCH', token, body: {
    tone: 'صمیمی و مؤدبانه، بدون اغراق',
    shipping: 'ارسال با پست پیشتاز ۴۵٬۰۰۰ تومان؛ سفارش‌های بالای ۲ میلیون تومان ارسال رایگان. تحویل ۲ تا ۴ روز کاری.',
    payment: 'کارت به کارت یا درگاه آنلاین؛ لینک پرداخت پس از تأیید سفارش ارسال می‌شود.',
    workingHours: 'شنبه تا پنجشنبه، ۱۰ صبح تا ۸ شب.',
  }});

  const existing = await req('/products', { token });
  if (existing.length > 0) {
    console.log(`already seeded (${existing.length} products)`);
    console.log('TOKEN=' + token);
    return;
  }

  for (const item of catalog) {
    const product = await req('/products', { method: 'POST', token, body: { title: item.title, category: item.category, description: item.description } });
    for (const v of item.variants) {
      await req(`/products/${product.id}/variants`, { method: 'POST', token, body: { sku: v.sku, size: v.size, color: v.color, price: v.price, stock: 0 } });
      const created = await req(`/products/${product.id}`, { token });
      const variant = created.variants.find(x => x.sku === v.sku);
      if (v.stock > 0) {
        await req(`/variants/${variant.id}/stock`, { method: 'POST', token, body: { delta: v.stock, reason: 'restock' } });
      }
    }
    console.log('seeded', item.title);
  }

  // A few real sales so the dashboard has activity.
  const products = await req('/products', { token });
  const sellable = products.flatMap(p => p.variants.filter(v => v.stock > 1).map(v => ({ ...v, title: p.title }))).slice(0, 6);
  for (const v of sellable) {
    try {
      await req(`/variants/${v.id}/sell`, { method: 'POST', token, body: { quantity: 1 }, headers: { 'Idempotency-Key': `seed-${v.id.slice(0, 8)}-a` } });
    } catch (e) { console.log('sell skipped', v.title, e.message.slice(0, 80)); }
  }
  console.log('TOKEN=' + token);
}
main().catch(e => { console.error(e); process.exit(1); });
