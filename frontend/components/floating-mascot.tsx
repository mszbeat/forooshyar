'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { BrandMascot } from './brand-mascot';

const BUBBLES = [
  'سلام! امروز فروش خوبی داشته باشید 🌟',
  'موجودی امروز را چک کردید؟',
  'یک سفارش جدید در راه است!',
  'پاسخ‌های خودکار فعال‌اند ✅',
  'کاتالوگ‌تان را به‌روز نگه دارید.',
];

/**
 * ماسکات شناور ثابت پایین-چپ در همه‌ی صفحات پنل.
 * - wrapper pointer-events:none و فقط خود ماسکات قابل کلیک است.
 * - physical left (نه inline-start) تا در RTL هم پایین-چپ بماند.
 * - safe-area aware، قابل جمع‌شدن، در صفحات خیلی کوچک مخفی.
 * - فقط پلک می‌زند و به‌آرامی بالا/پایین می‌شود (شناور روی دکمه)؛ هیچ
 *   چرخش/واکنش/دنبال‌کردن چشم نیست.
 * - حباب گفتار فارسی نادر.
 * - با IntersectionObserver وقتی بیرون از دید است متوقف می‌شود و
 *   prefers-reduced-motion را رعایت می‌کند.
 */
export function FloatingMascot() {
  const [collapsed, setCollapsed] = useState(false);
  const [bubble, setBubble] = useState('');
  const [visible, setVisible] = useState(true);
  const [reduced, setReduced] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const bubbleIdxRef = useRef(0);

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem('forooshyar.mascotCollapsed') === '1');
    } catch { /* ignore */ }
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // توقف وقتی بیرون از دید است
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || !('IntersectionObserver' in window)) return;
    const obs = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.05 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // حباب گفتار نادر
  useEffect(() => {
    if (reduced || !visible) return;
    let alive = true;
    let bubbleTimer = 0;
    const scheduleBubble = () => {
      bubbleTimer = window.setTimeout(() => {
        if (!alive) return;
        setBubble(BUBBLES[bubbleIdxRef.current % BUBBLES.length]);
        bubbleIdxRef.current += 1;
        window.setTimeout(() => { if (alive) setBubble(''); }, 4200);
        scheduleBubble();
      }, 45000 + Math.random() * 60000);
    };
    scheduleBubble();
    return () => {
      alive = false;
      window.clearTimeout(bubbleTimer);
    };
  }, [reduced, visible]);

  const toggle = useCallback(() => {
    setCollapsed(prev => {
      const next = !prev;
      try { window.localStorage.setItem('forooshyar.mascotCollapsed', next ? '1' : '0'); } catch { /* ignore */ }
      return next;
    });
  }, []);

  if (collapsed) {
    return (
      <div className="floating-mascot floating-mascot-collapsed">
        <button type="button" className="floating-mascot-open" onClick={toggle} aria-label="نمایش ماسکات فروش‌یار">
          <BrandMascot size={30} animated={false} />
        </button>
      </div>
    );
  }

  return (
    <div ref={wrapRef} className="floating-mascot" aria-hidden={false}>
      {bubble && <div className="floating-mascot-bubble" role="status">{bubble}</div>}
      <button type="button" className="floating-mascot-main" onClick={toggle} aria-label="جمع‌کردن ماسکات فروش‌یار" title="جمع‌کردن">
        <BrandMascot size={84} animated={!reduced} />
      </button>
    </div>
  );
}
