'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { BrandMascot, type MascotExpression } from './brand-mascot';

const REACTIONS: MascotExpression[] = ['smile', 'wave', 'wink', 'laugh', 'surprised', 'hearts'];
const BUBBLES = [
  'سلام! امروز فروش خوبی داشته باشید 🌟',
  'موجودی امروز را چک کردید؟',
  'یک سفارش جدید در راه است!',
  'پاسخ‌های خودکار فعال‌اند ✅',
  'کاتالوگ‌تان را به‌روز نگه دارید.',
];

function shuffled<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * ماسکات شناور ثابت پایین-چپ در همه‌ی صفحات پنل.
 * - wrapper pointer-events:none و فقط خود ماسکات قابل کلیک است.
 * - physical left (نه inline-start) تا در RTL هم پایین-چپ بماند.
 * - safe-area aware، قابل جمع‌شدن، در صفحات خیلی کوچک مخفی.
 * - eye-tracking با damping (lerp در rAF)، پلک‌زدن تصادفی، واکنش‌های
 *   shuffle بدون تکرار فوری، حباب گفتار فارسی نادر.
 * - با IntersectionObserver وقتی بیرون از دید است متوقف می‌شود و
 *   prefers-reduced-motion را رعایت می‌کند.
 */
export function FloatingMascot() {
  const [collapsed, setCollapsed] = useState(false);
  const [expression, setExpression] = useState<MascotExpression>('idle');
  const [bubble, setBubble] = useState('');
  const [visible, setVisible] = useState(true);
  const [reduced, setReduced] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const eyeRef = useRef({ x: 0, y: 0 });
  const targetRef = useRef({ x: 0, y: 0 });
  const bagRef = useRef<MascotExpression[]>([]);
  const bubbleIdxRef = useRef(0);
  const rafRef = useRef(0);

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

  // eye-tracking با damping
  useEffect(() => {
    if (reduced) return;
    const onMove = (e: MouseEvent) => {
      const el = wrapRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const dist = Math.hypot(dx, dy) || 1;
      const max = 3.2;
      targetRef.current = {
        x: (dx / dist) * Math.min(max, dist / 40),
        y: (dy / dist) * Math.min(max, dist / 40),
      };
    };
    const tick = () => {
      if (visible) {
        eyeRef.current.x += (targetRef.current.x - eyeRef.current.x) * 0.12;
        eyeRef.current.y += (targetRef.current.y - eyeRef.current.y) * 0.12;
        const el = wrapRef.current;
        if (el) {
          const eyes = el.querySelector('.brand-eyes');
          if (eyes) eyes.setAttribute('transform', `translate(${eyeRef.current.x.toFixed(2)} ${eyeRef.current.y.toFixed(2)})`);
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    window.addEventListener('mousemove', onMove, { passive: true });
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener('mousemove', onMove);
      cancelAnimationFrame(rafRef.current);
    };
  }, [reduced, visible]);

  // پلک‌زدن تصادفی + واکنش‌های shuffle + حباب نادر
  useEffect(() => {
    if (reduced || !visible) return;
    let alive = true;
    let blinkTimer = 0;
    let reactTimer = 0;
    let bubbleTimer = 0;
    const scheduleBlink = () => {
      blinkTimer = window.setTimeout(() => {
        if (!alive) return;
        setExpression(prev => (prev === 'idle' ? 'squint' : prev));
        window.setTimeout(() => { if (alive) setExpression('idle'); }, 140);
        scheduleBlink();
      }, 2200 + Math.random() * 3800);
    };
    const scheduleReact = () => {
      reactTimer = window.setTimeout(() => {
        if (!alive) return;
        if (bagRef.current.length === 0) bagRef.current = shuffled(REACTIONS);
        const next = bagRef.current.pop() ?? 'smile';
        setExpression(next);
        window.setTimeout(() => { if (alive) setExpression('idle'); }, 1600);
        scheduleReact();
      }, 9000 + Math.random() * 12000);
    };
    const scheduleBubble = () => {
      bubbleTimer = window.setTimeout(() => {
        if (!alive) return;
        setBubble(BUBBLES[bubbleIdxRef.current % BUBBLES.length]);
        bubbleIdxRef.current += 1;
        window.setTimeout(() => { if (alive) setBubble(''); }, 4200);
        scheduleBubble();
      }, 45000 + Math.random() * 60000);
    };
    scheduleBlink(); scheduleReact(); scheduleBubble();
    return () => {
      alive = false;
      window.clearTimeout(blinkTimer); window.clearTimeout(reactTimer); window.clearTimeout(bubbleTimer);
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
        <BrandMascot size={84} expression={expression} animated={!reduced} />
      </button>
    </div>
  );
}
