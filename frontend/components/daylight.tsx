'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { IconMoon, IconSun } from '@/components/icons';

/**
 * موتور نور روز/شب.
 * ---------------------------------------------------------------------------
 * ایده از سایت مرجع: یک نوار ساعت را جابه‌جا می‌کند و کل پالت صفحه تدریجی از
 * سپیده به غروب و شب می‌رود. اینجا همان کار با پنج فاز انجام می‌شود، چون
 * پالت هر فاز سنجیده شده است و رنگ‌های آن میان دو فاز به‌صورت پیوسته
 * درون‌یابی می‌شوند؛ بنابراین هر تغییر دقیقه‌ای نوار، رنگ صفحه را جلو می‌برد.
 * رنگ‌های پایه در app/design-v3.css تعریف شده‌اند.
 *
 * چرا localStorage: انتخاب فروشنده باید بین بازدیدها بماند و در هر دو پنل
 * یکی باشد. اگر چیزی ذخیره نشده باشد، ساعتِ خودِ دستگاه مبنا است؛ یعنی
 * کاربر ساعت ۹ شب پنل را باز می‌کند و پنل هم شب است.
 */

const KEY = 'forooshyar.daylight';
const CHANGE = 'forooshyar:daylight';

type PhaseKey = 'dawn' | 'morning' | 'midday' | 'glow' | 'night';

const PHASES: { to: number; key: PhaseKey; label: string }[] = [
  { to: 300, key: 'night', label: 'شب' },
  { to: 420, key: 'dawn', label: 'سپیده' },
  { to: 600, key: 'morning', label: 'بامداد' },
  { to: 930, key: 'midday', label: 'نیم‌روز' },
  { to: 1110, key: 'glow', label: 'غروب' },
  { to: 1441, key: 'night', label: 'شب' },
];

/** آخرین ساعتی که روی صفحه اعمال شده؛ تا وقتی نوارها/هوک‌ها سوار می‌شوند،
 *  همان را ادامه بدهند و مقدار پیش‌فرض خودشان را تحمیل نکنند. بدون این،
 *  صفحه‌ی اصلی که با «نور روز» شروع شده بود، با سوار شدن نوار به ساعت دستگاه
 *  (شب) می‌پرید. */
let activeMinutes: number | null = null;

function phaseFor(minutes: number) {
  return PHASES.find(phase => minutes < phase.to) ?? PHASES[PHASES.length - 1];
}

/** صفحه‌های عمومی (اصلی و ورود) همیشه با نور روز شروع می‌شوند؛ پنل با ساعت
 *  دستگاه. دلیل: بازدیدکننده‌ای که نیمه‌شب سایت را باز می‌کند باید محصول را
 *  روشن ببیند، ولی فروشنده‌ای که شب کار می‌کند پنلش را شب بخواهد. */
const MARKETING_KEY = 'forooshyar.daylight.marketing';

function nowMinutes() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function storedMinutes(): number | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const value = Number.parseInt(raw, 10);
    return Number.isFinite(value) ? Math.min(1439, Math.max(0, value)) : null;
  } catch {
    return null;
  }
}

/** پالت را روی <html> می‌نشاند؛ `data-theme` هم هم‌گام می‌شود تا قواعد کهنه‌ی
 *  تیره (که هنوز در globals.css هستند) با «شب» یکی بمانند. */
const COLOR_TOKENS = [
  '--bg', '--bg-deep', '--surface', '--surface-2', '--surface-3', '--line', '--line-strong',
  '--ink', '--ink-2', '--ink-3', '--ink-4', '--brand', '--brand-600', '--brand-400',
  '--brand-50', '--brand-100', '--brand-200', '--brand-ink', '--saffron', '--amber',
  '--amber-soft', '--amber-line', '--danger', '--danger-soft', '--danger-line', '--ok',
  '--ok-soft', '--info', '--info-soft',
];
const PALETTE_STOPS: { at: number; key: PhaseKey }[] = [
  { at: 0, key: 'night' }, { at: 300, key: 'dawn' }, { at: 420, key: 'morning' },
  { at: 600, key: 'midday' }, { at: 930, key: 'glow' }, { at: 1110, key: 'night' },
  { at: 1440, key: 'night' },
];
let paletteCache: Record<PhaseKey, Record<string, string>> | null = null;

function readPalettes() {
  if (paletteCache) return paletteCache;
  const root = document.documentElement;
  const oldPhase = root.dataset.phase;
  const oldTheme = root.dataset.theme;
  const palettes = {} as Record<PhaseKey, Record<string, string>>;
  for (const key of ['night', 'dawn', 'morning', 'midday', 'glow'] as PhaseKey[]) {
    root.dataset.phase = key;
    root.dataset.theme = key === 'night' ? 'dark' : 'light';
    const css = getComputedStyle(root);
    palettes[key] = Object.fromEntries(COLOR_TOKENS.map(token => [token, css.getPropertyValue(token).trim()]));
  }
  if (oldPhase) root.dataset.phase = oldPhase; else delete root.dataset.phase;
  if (oldTheme) root.dataset.theme = oldTheme; else delete root.dataset.theme;
  return (paletteCache = palettes);
}

function rgbValue(value: string): [number, number, number] | null {
  const hex = value.match(/^#([\da-f]{3}|[\da-f]{6})$/i);
  if (hex) {
    const raw = hex[1].length === 3 ? [...hex[1]].map(c => c + c).join('') : hex[1];
    const n = Number.parseInt(raw, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const rgb = value.match(/rgba?\((\d+(?:\.\d+)?)[, ]+\s*(\d+(?:\.\d+)?)[, ]+\s*(\d+(?:\.\d+)?)/i);
  return rgb ? [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])] : null;
}
function toOklab(color: string): [number, number, number] | null {
  const srgb = rgbValue(color);
  if (!srgb) return null;
  const [r, g, b] = srgb.map(v => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  const l = Math.cbrt(0.4122214708*r + 0.5363325363*g + 0.0514459929*b);
  const m = Math.cbrt(0.2119034982*r + 0.6806995451*g + 0.1073969566*b);
  const s = Math.cbrt(0.0883024619*r + 0.2817188376*g + 0.6299787005*b);
  return [0.2104542553*l + 0.7936177850*m - 0.0040720468*s, 1.9779984951*l - 2.4285922050*m + 0.4505937099*s, 0.0259040371*l + 0.7827717662*m - 0.8086757660*s];
}
function fromOklab(L: number, a: number, b: number) {
  const l = (L + 0.3963377774*a + 0.2158037573*b) ** 3;
  const m = (L - 0.1055613458*a - 0.0638541728*b) ** 3;
  const s = (L - 0.0894841775*a - 1.2914855480*b) ** 3;
  const linear = [4.0767416621*l - 3.3077115913*m + 0.2309699292*s, -1.2684380046*l + 2.6097574011*m - 0.3413193965*s, -0.0041960863*l - 0.7034186147*m + 1.7076147010*s];
  const channel = (v: number) => Math.round(255 * (v <= 0.0031308 ? 12.92*v : 1.055*Math.max(0,v)**(1/2.4)-0.055));
  return `rgb(${linear.map(channel).join(' ')})`;
}
function blendColor(from: string, to: string, amount: number) {
  const a = toOklab(from), b = toOklab(to);
  if (!a || !b) return amount < 0.5 ? from : to;
  return fromOklab(a[0] + (b[0]-a[0])*amount, a[1] + (b[1]-a[1])*amount, a[2] + (b[2]-a[2])*amount);
}
function luminance(color: string) {
  const channels = rgbValue(color);
  if (!channels) return 0;
  const linear = channels.map(value => { const c = value/255; return c <= 0.04045 ? c/12.92 : ((c+0.055)/1.055)**2.4; });
  return linear[0]*0.2126 + linear[1]*0.7152 + linear[2]*0.0722;
}
function contrast(a: string, b: string) {
  const values = [luminance(a), luminance(b)].sort((x,y) => y-x);
  return (values[0]+0.05)/(values[1]+0.05);
}

function apply(minutes: number) {
  activeMinutes = minutes;
  const phase = phaseFor(minutes);
  const root = document.documentElement;
  root.dataset.phase = phase.key;
  root.dataset.theme = phase.key === 'night' ? 'dark' : 'light';

  // پالت هر فاز بین توقف‌های ساعت به‌صورت پیوسته ترکیب می‌شود؛ هر دقیقه و
  // هر حرکت کوچک نوار، واقعاً رنگ متغیرهای سایت را جلو می‌برد.
  const rightIndex = PALETTE_STOPS.findIndex(stop => stop.at > minutes);
  const right = PALETTE_STOPS[Math.max(1, rightIndex)];
  const left = PALETTE_STOPS[Math.max(0, rightIndex - 1)];
  const amount = Math.max(0, Math.min(1, (minutes - left.at) / (right.at - left.at)));
  const palettes = readPalettes();
  for (const token of COLOR_TOKENS) {
    root.style.setProperty(token, blendColor(palettes[left.key][token], palettes[right.key][token], amount));
  }

  // در گذار سپیده/غروب، متن را هم‌زمان با زمینه خاکستری نمی‌کنیم؛ رنگ متن
  // از دو گزینهٔ روشن/تیره، آنی با بیشترین کنتراست نسبت به زمینه را می‌گیرد.
  const background = root.style.getPropertyValue('--bg');
  for (const token of ['--ink', '--ink-2', '--ink-3', '--ink-4']) {
    const darkText = palettes.midday[token];
    const lightText = palettes.night[token];
    root.style.setProperty(token, contrast(darkText, background) >= contrast(lightText, background) ? darkText : lightText);
  }
  const brandBackground = root.style.getPropertyValue('--brand');
  root.style.setProperty('--brand-ink', contrast(palettes.midday['--brand-ink'], brandBackground) >= contrast(palettes.night['--brand-ink'], brandBackground) ? palettes.midday['--brand-ink'] : palettes.night['--brand-ink']);

  root.style.colorScheme = phase.key === 'night' ? 'dark' : 'light';
  root.querySelector('meta[name="theme-color"]')?.setAttribute(
    'content', phase.key === 'night' ? '#0b0d11' : '#f4f1e9',
  );
  return phase;
}

export function setDaylight(minutes: number) {
  const clamped = Math.min(1439, Math.max(0, Math.round(minutes)));
  try {
    localStorage.setItem(KEY, String(clamped));
  } catch {
    /* حالت خصوصی مرورگر */
  }
  apply(clamped);
  window.dispatchEvent(new CustomEvent(CHANGE, { detail: clamped }));
}

/** هوک مشترک: مقدار فعلی + تنظیم آن، هم‌گام بین همه‌ی نوارها. */
function useDaylight() {
  const [minutes, setMinutes] = useState(720);

  useEffect(() => {
    const start = activeMinutes ?? storedMinutes() ?? nowMinutes();
    setMinutes(start);
    apply(start);

    const onChange = (event: Event) => setMinutes((event as CustomEvent<number>).detail);
    window.addEventListener(CHANGE, onChange);
    return () => window.removeEventListener(CHANGE, onChange);
  }, []);

  const set = useCallback((next: number) => setDaylight(next), []);
  return { minutes, set, phase: phaseFor(minutes) };
}

function clock(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

/**
 * راه‌انداز موتور در ریشه‌ی برنامه؛ چیزی رندر نمی‌کند. لازم است در همه‌ی
 * صفحات (از جمله ورود) بنشیند تا پالت پیش از اولین قاب درست باشد.
 */
export function DayLightBoot() {
  useEffect(() => {
    const stored = storedMinutes();
    if (stored !== null) {
      apply(stored);
      return;
    }
    // پنل: ساعت دستگاه. صفحه‌های عمومی: پالت روز.
    const path = window.location.pathname;
    const marketing = path === '/' || path.startsWith('/login') || path.startsWith('/admin/login') || path.startsWith('/dashboard');
    if (marketing) {
      let preferred = 705;
      try {
        const saved = localStorage.getItem(MARKETING_KEY);
        if (saved !== null) preferred = Number.parseInt(saved, 10) || 705;
      } catch {
        /* بی‌صدا */
      }
      apply(preferred);
      return;
    }
    apply(nowMinutes());
  }, []);
  return null;
}

/** نوار جمع‌وجور برای نوار بالای پنل. */
export function DayLightScrubber({ className = '' }: { className?: string }) {
  const { minutes, set, phase } = useDaylight();
  const percent = (minutes / 1439) * 100;
  const night = phase.key === 'night';

  // کلیک روی آیکن، روز و شب را جابه‌جا می‌کند (میان‌بر همان کاری که نوار می‌کند).
  const jump = () => set(night ? 720 : 1290);

  return (
    <div className={`dl ${className}`} title="نور روز — با کشیدن نوار، پالت پنل از سپیده تا شب عوض می‌شود">
      <button
        type="button"
        onClick={jump}
        className="dl-ico"
        aria-label={night ? 'رفتن به نور روز' : 'رفتن به شب'}
        style={{ display: 'inline-flex', background: 'none', border: 0, padding: 0, cursor: 'pointer' }}
      >
        {night ? <IconMoon size={14} /> : <IconSun size={14} />}
      </button>

      <div className="dl-wrap">
        <div className="dl-track" aria-hidden="true">
          <span className="dl-knob" style={{ left: `${percent}%` }} />
        </div>
        <input
          type="range"
          min={0}
          max={1439}
          value={minutes}
          onChange={event => set(Number(event.target.value))}
          aria-label="ساعت روز؛ تغییر پالت پنل"
        />
      </div>

      <span className="dl-phase">{phase.label}</span>
      <span className="dl-clock">{clock(minutes)}</span>
    </div>
  );
}

/** نسخه‌ی بزرگ با مقیاس ساعت — برای صفحه‌ی اصلی و ورود. */
export function DayLightHero({ className = '' }: { className?: string }) {
  const { minutes, set, phase } = useDaylight();
  const percent = (minutes / 1439) * 100;
  // انتخاب روی صفحه‌ی اصلی جدا ذخیره می‌شود تا بازدید بعدی همان نور را ببیند.
  const choose = (value: number) => {
    set(value);
    try {
      localStorage.setItem(MARKETING_KEY, String(value));
    } catch {
      /* بی‌صدا */
    }
  };

  return (
    <div className={`dl-hero ${className}`}>
      <div className="dl-head">
        <span>
          نور پنل: <b style={{ color: 'var(--ink)', fontWeight: 600 }}>{phase.label}</b>
        </span>
        <span className="dl-clock" style={{ fontSize: 11 }}>{clock(minutes)}</span>
      </div>
      <div style={{ position: 'relative' }}>
        <div className="dl-hero-track" aria-hidden="true">
          <span className="dl-hero-knob" style={{ left: `${percent}%` }} />
        </div>
        <input
          type="range"
          min={0}
          max={1439}
          value={minutes}
          onChange={event => choose(Number(event.target.value))}
          aria-label="ساعت روز؛ تغییر پالت صفحه"
        />
      </div>
      <div className="dl-scale">
        <span>۰۰</span>
        <span>۰۶</span>
        <span>۱۲</span>
        <span>۱۸</span>
        <span>۲۴</span>
      </div>
    </div>
  );
}

/** نسخه‌ی پایه برای جاهایی که فقط مقدار لازم است (مثلاً دکمه‌ی تم قدیمی). */
export function useDaylightToggle() {
  const { minutes, set } = useDaylight();
  const dark = phaseFor(minutes).key === 'night';
  return { dark, toggle: () => set(dark ? 720 : 1290) };
}

