'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/**
 * حرکت‌های اسکرول.
 * ---------------------------------------------------------------------------
 * سه چیز را از سایت مرجع می‌آورد و روی کل پنل اعمال می‌کند، بدون اینکه لازم
 * باشد هر صفحه جداگانه تغییر کند:
 *
 *  ۱. بالا آمدن نرم کارت‌ها و سربرگ‌ها با ورود به قاب دید (کلاس `.fx`).
 *  ۲. پرده‌ی کنار‌رو برای «صفحه‌های» شاخص (`[data-wipe]`).
 *  ۳. پارالاکس ملایم برای عناصری که `data-depth` دارند.
 *
 * قاعده‌ی مهم: کلاس `.fx` را **جاوااسکریپت** اضافه می‌کند، نه HTML. اگر اسکریپت
 * اجرا نشود یا کاربر «کاهش حرکت» خواسته باشد، هیچ‌چیز پنهان نمی‌ماند.
 */

const SELECTORS = [
  '.page > .page-head',
  '.page-head',
  '.card',
  '.stat-strip',
  '.stat',
  '.row-item',
  '.adm-sec',
  '.adm-kpi',
  '.bento .tile',
  '.compare-col',
  '.flow-step',
  '.rule',
  '.faq-item',
  '.tile',
];

const reduced = () =>
  typeof window !== 'undefined' &&
  window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function MotionBoot() {
  const pathname = usePathname();

  useEffect(() => {
    if (reduced()) return;

    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('in');
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -30px 0px' },
    );

    const seen = new WeakSet<Element>();

    const scan = () => {
      let order = 0;
      for (const selector of SELECTORS) {
        document.querySelectorAll<HTMLElement>(selector).forEach(node => {
          if (seen.has(node)) return;
          seen.add(node);
          order += 1;
          node.style.setProperty('--fx-delay', `${Math.min(order, 6) * 45}ms`);
          node.classList.add('fx');
          observer.observe(node);
        });
      }
      document.querySelectorAll<HTMLElement>('[data-wipe]').forEach(node => {
        if (seen.has(node)) return;
        seen.add(node);
        node.classList.add('wipe-plate');
        observer.observe(node);
      });
    };

    // پنل بعد از احراز هویت و به‌صورت کلاینتی رندر می‌شود؛ پس یک اسکن اولیه
    // کافی نیست. اسکن را با MutationObserver تکرار می‌کنیم (با تأخیر کوتاه) تا
    // محتوایی که دیرتر می‌آید هم حرکت بگیرد.
    let queued = 0;
    const schedule = () => {
      if (queued) return;
      queued = window.setTimeout(() => {
        queued = 0;
        scan();
        parallaxScan();
      }, 90);
    };

    // پارالاکس: فقط عناصری که data-depth دارند و تا حالا ندیدیم.
    const plates = new Set<HTMLElement>();
    let ticking = false;
    const move = () => {
      ticking = false;
      const viewport = window.innerHeight;
      plates.forEach(plate => {
        const rect = plate.getBoundingClientRect();
        if (rect.bottom < -100 || rect.top > viewport + 100) return;
        const progress = (rect.top + rect.height / 2 - viewport / 2) / viewport;
        const depth = Number.parseFloat(plate.dataset.depth ?? '0') || 0;
        plate.style.setProperty('--py', `${(-progress * depth * 90).toFixed(1)}px`);
      });
    };
    const queue = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(move);
    };
    const parallaxScan = () => {
      document.querySelectorAll<HTMLElement>('[data-depth]').forEach(node => {
        if (plates.has(node)) return;
        plates.add(node);
        queue();
      });
    };

    scan();
    parallaxScan();

    const mutation = new MutationObserver(schedule);
    mutation.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('scroll', queue, { passive: true });
    window.addEventListener('resize', queue);

    return () => {
      mutation.disconnect();
      window.clearTimeout(queued);
      window.removeEventListener('scroll', queue);
      window.removeEventListener('resize', queue);
      observer.disconnect();
    };
  }, [pathname]);

  return null;
}
