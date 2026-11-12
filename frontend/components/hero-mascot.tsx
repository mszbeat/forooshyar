'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { BrandMascot, type MascotExpression } from '@/components/brand-mascot';

/**
 * ماسکات بزرگ تعاملی لندینگ.
 *
 * - idle: شناور + پلک‌زدن + نگاه چپ/راست گاه‌به‌گاه
 * - hover/tap: واکنش تصادفی از «کیسه‌ی درهم‌ریخته» (هرگز پشت‌سرهم تکرار نمی‌شود)
 * - کلیک: تخم‌مرغ عید (چرخش سرگیجه + ذرات)
 * - حباب گفتار با جمله‌ی فارسی کوتاه برای بعضی واکنش‌ها
 * - prefers-reduced-motion: صورت ثابت دوستانه، بدون انیمیشن
 * - IntersectionObserver: وقتی از صفحه بیرون است، انیمیشن متوقف می‌شود
 */

const REACTIONS: { expression: MascotExpression; line?: string }[] = [
  { expression: 'smile', line: 'سلام! 👋' },
  { expression: 'laugh', line: 'خوشحالم که اینجایی! 😄' },
  { expression: 'wink', line: 'یه راز: قیمت‌ها همیشه از دیتابیس میاد 😉' },
  { expression: 'surprised', line: 'وای، مشتری اومد! 😮' },
  { expression: 'hearts', line: 'عاشق فروشم! 💖' },
  { expression: 'thinking', line: 'دارم فکر می‌کنم… 🤔' },
  { expression: 'wave', line: 'سلام سلام! 👋' },
  { expression: 'squint', line: 'همه‌چیز تحت کنترله! 😊' },
];

const SPARKLES = ['✨', '💫', '⭐', '💖'];

export function HeroMascot({ size = 180 }: { size?: number }) {
  const [expression, setExpression] = useState<MascotExpression>('idle');
  const [line, setLine] = useState<string | null>(null);
  const [sparkles, setSparkles] = useState<{ id: number; char: string; left: string }[]>([]);
  const [visible, setVisible] = useState(true);
  const bagRef = useRef<number[]>([]);
  const lastRef = useRef(-1);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // توقف انیمیشن وقتی از صفحه بیرون است
  useEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(entries => setVisible(entries[0]?.isIntersecting ?? true), { threshold: 0.1 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const clearTimer = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  };

  const react = useCallback((index: number) => {
    clearTimer();
    const reaction = REACTIONS[index];
    setExpression(reaction.expression);
    setLine(reaction.line ?? null);
    if (reaction.line) {
      timerRef.current = setTimeout(() => { setLine(null); setExpression('idle'); }, 2200);
    } else {
      timerRef.current = setTimeout(() => setExpression('idle'), 1200);
    }
  }, []);

  const nextReaction = useCallback(() => {
    if (bagRef.current.length === 0) {
      bagRef.current = REACTIONS.map((_, i) => i).filter(i => i !== lastRef.current);
      // درهم‌ریختن
      for (let i = bagRef.current.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [bagRef.current[i], bagRef.current[j]] = [bagRef.current[j], bagRef.current[i]];
      }
    }
    const index = bagRef.current.pop() ?? 0;
    lastRef.current = index;
    react(index);
  }, [react]);

  const easterEgg = useCallback(() => {
    clearTimer();
    setExpression('dizzy');
    setLine('سرم گیج رفت! 😵');
    setSparkles(SPARKLES.map((char, i) => ({ id: Date.now() + i, char, left: `${15 + i * 22}%` })));
    timerRef.current = setTimeout(() => {
      setExpression('idle');
      setLine(null);
      setSparkles([]);
    }, 2000);
  }, []);

  // نگاه چپ/راست گاه‌به‌گاه در حالت idle
  useEffect(() => {
    if (!visible) return;
    const interval = setInterval(() => {
      setExpression(current => (current === 'idle' ? (Math.random() > 0.5 ? 'thinking' : 'idle') : current));
    }, 6000);
    return () => clearInterval(interval);
  }, [visible]);

  useEffect(() => clearTimer, []);

  return (
    <div
      ref={rootRef}
      className={`hero-mascot mascot-${expression}`}
      onMouseEnter={nextReaction}
      onClick={easterEgg}
      onFocus={nextReaction}
      tabIndex={0}
      role="button"
      aria-label="ماسکات فروش‌یار — روی من نگه دار یا کلیک کن"
      style={{ cursor: 'pointer', outline: 'none' }}
    >
      {line && <span className="hero-mascot-bubble" aria-live="polite">{line}</span>}
      {sparkles.map(sparkle => (
        <span key={sparkle.id} className="hero-mascot-sparkle" style={{ left: sparkle.left, top: '10%' }}>
          {sparkle.char}
        </span>
      ))}
      <BrandMascot size={size} expression={expression} animated={visible} />
    </div>
  );
}
