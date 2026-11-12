'use client';

import { useEffect, useRef, useState } from 'react';
import { BrandMascot } from '@/components/brand-mascot';

/**
 * ماسکات لندینگ — فقط پلک می‌زند و به‌آرامی بالا/پایین می‌شود (حس زنده‌بودن).
 * هیچ واکنش/چرخش/تخم‌مرغی نیست تا طراحی تأییدشده دقیقاً همان بماند.
 * با IntersectionObserver وقتی از صفحه بیرون است، انیمیشن متوقف می‌شود و
 * prefers-reduced-motion را رعایت می‌کند.
 */
export function HeroMascot({ size = 180 }: { size?: number }) {
  const [visible, setVisible] = useState(true);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // توقف انیمیشن وقتی از صفحه بیرون است
  useEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(entries => setVisible(entries[0]?.isIntersecting ?? true), { threshold: 0.1 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={rootRef} className="hero-mascot" role="img" aria-label="ماسکات فروش‌یار">
      <BrandMascot size={size} animated={visible} float={visible} />
    </div>
  );
}
