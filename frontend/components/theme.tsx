'use client';

import { useCallback, useEffect, useState } from 'react';
import { IconMoon, IconSun } from '@/components/icons';

/*
 * پوستهٔ تاریک/روشن.
 * ---------------------------------------------------------------------------
 * انتخاب کاربر در localStorage می‌ماند و روی <html> به‌صورت data-theme نوشته
 * می‌شود؛ همهٔ رنگ‌ها از توکن‌های globals.css می‌آیند، پس یک اتریبیوت کافی است
 * و هیچ کامپوننتی نیاز به تغییر ندارد. اسکریپت کوچکِ داخل <head> (در layout
 * ریشه) تم را پیش از رنگ‌آمیزی اول اعمال می‌کند تا پرشِ سفید→تیره نبینیم.
 */

export const THEME_KEY = 'forooshyar.theme';
export type Theme = 'light' | 'dark';

function apply(theme: Theme) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  root.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#08090a' : '#f6f7f9');
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>('dark');

  useEffect(() => {
    const current = (document.documentElement.dataset.theme as Theme) || 'dark';
    setTheme(current);
  }, []);

  const set = useCallback((next: Theme) => {
    setTheme(next);
    apply(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* حالت خصوصی مرورگر — بی‌صدا رد می‌شویم */
    }
  }, []);

  const toggle = useCallback(() => {
    set(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
  }, [set]);

  return { theme, setTheme: set, toggle };
}

/** دکمهٔ کوچک تغییر تم — در نوار بالای هر دو پنل استفاده می‌شود. */
export function ThemeToggle({ className = '' }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const dark = theme === 'dark';
  return (
    <button
      type="button"
      onClick={toggle}
      className={`btn btn-ghost btn-icon theme-toggle ${className}`}
      title={dark ? 'حالت روشن' : 'حالت تاریک'}
      aria-label={dark ? 'تغییر به حالت روشن' : 'تغییر به حالت تاریک'}
      aria-pressed={dark}
    >
      {dark ? <IconSun size={17} /> : <IconMoon size={17} />}
    </button>
  );
}
