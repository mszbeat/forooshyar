'use client';

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { Spinner } from '@/components/ui';
import {
  IconBell, IconBox, IconChat, IconDashboard, IconLogo, IconLogout, IconMenu, IconWallet,
  IconSettings, IconSparkles, IconStore, IconUpload, IconUsers, IconX,
} from '@/components/icons';

const NAV = [
  { href: '/app', label: 'داشبورد', icon: IconDashboard, exact: true },
  { href: '/app/products', label: 'محصولات و موجودی', icon: IconBox },
  { href: '/app/orders', label: 'سفارش‌ها', icon: IconWallet },
  { href: '/app/import', label: 'ورود کاتالوگ', icon: IconUpload },
  { href: '/app/assistant', label: 'دستیار پاسخ‌گو', icon: IconSparkles },
  { href: '/app/settings', label: 'تنظیمات فروشگاه', icon: IconSettings },
];

const SOON = [
  { label: 'گفتگوها', icon: IconChat, note: 'به‌زودی' },
  { label: 'مشتریان', icon: IconUsers, note: 'به‌زودی' },
];

const TITLES: Record<string, { title: string; sub: string }> = {
  '/app': { title: 'داشبورد', sub: 'تصویر کلی فروشگاه در یک نگاه' },
  '/app/products': { title: 'محصولات و موجودی', sub: 'کاتالوگ، واریانت‌ها و دفتر گردش' },
  '/app/import': { title: 'ورود کاتالوگ', sub: 'بارگذاری گروهی از فایل اکسل یا CSV' },
  '/app/assistant': { title: 'دستیار پاسخ‌گو', sub: 'آزمایش پاسخ فروش‌یار پیش از انتشار' },
  '/app/settings': { title: 'تنظیمات فروشگاه', sub: 'لحن، ارسال، پرداخت و پیام ارجاع' },
};

export default function PanelLayout({ children }: { children: ReactNode }) {
  const { ready, token, shop, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [drawer, setDrawer] = useState(false);

  useEffect(() => {
    if (ready && !token) router.replace('/login');
  }, [ready, token, router]);

  useEffect(() => { setDrawer(false); }, [pathname]);

  if (!ready || !token) {
    return (
      <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', color: 'var(--brand)' }}>
        <div style={{ display: 'grid', justifyItems: 'center', gap: 12 }}>
          <Spinner size={26} />
          <span className="small muted">در حال بارگذاری پنل…</span>
        </div>
      </div>
    );
  }

  const meta = TITLES[pathname] ?? { title: 'پنل فروشنده', sub: '' };
  const isActive = (href: string, exact?: boolean) => (exact ? pathname === href : pathname.startsWith(href));

  const sidebar = (
    <aside className={`sidebar ${drawer ? 'open' : ''}`}>
      <div className="brand">
        <span className="brand-mark"><IconLogo size={20} /></span>
        <div>
          <div className="brand-name">فروش‌یار</div>
          <div className="brand-sub">پنل فروشنده</div>
        </div>
        <button
          type="button" className="btn btn-ghost btn-icon btn-sm hide-sm"
          style={{ marginInlineStart: 'auto', display: 'none' }}
          onClick={() => setDrawer(false)} aria-label="بستن منو"
        >
          <IconX size={16} />
        </button>
      </div>

      <div className="nav-group">
        <div className="nav-label">فروشگاه</div>
        {NAV.map(item => (
          <Link key={item.href} href={item.href} className={`nav-item ${isActive(item.href, item.exact) ? 'active' : ''}`}>
            <item.icon className="nav-icon" />
            <span>{item.label}</span>
          </Link>
        ))}
      </div>

      <div className="nav-group">
        <div className="nav-label">به‌زودی</div>
        {SOON.map(item => (
          <span key={item.label} className="nav-item disabled" aria-disabled="true">
            <item.icon className="nav-icon" />
            <span>{item.label}</span>
            <span className="nav-badge">{item.note}</span>
          </span>
        ))}
      </div>

      <div className="sidebar-foot">
        <div className="side-card">
          <strong><IconStore size={13} style={{ display: 'inline', verticalAlign: '-2px', marginInlineEnd: 4 }} />{shop?.name ?? 'فروشگاه شما'}</strong>
          هر تغییری در موجودی همین‌جا ثبت و در پاسخ‌های خودکار استفاده می‌شود.
        </div>
        <button type="button" className="nav-item" style={{ width: '100%', marginTop: 8, background: 'none', border: 0, cursor: 'pointer', textAlign: 'right' }} onClick={logout}>
          <IconLogout className="nav-icon" />
          <span>خروج از حساب</span>
        </button>
      </div>
    </aside>
  );

  return (
    <div className="shell">
      {drawer && <div className="scrim" onClick={() => setDrawer(false)} />}
      {sidebar}

      <div className="main">
        <header className="topbar">
          <button
            type="button" className="btn btn-ghost btn-icon"
            style={{ display: 'none' }} id="nav-toggle"
            onClick={() => setDrawer(true)} aria-label="باز کردن منو"
          >
            <IconMenu size={18} />
          </button>
          <style>{`@media (max-width: 900px){#nav-toggle{display:inline-flex !important} .sidebar .hide-sm{display:inline-flex !important} .topbar .hide-sm{display:block !important} .topbar-sub{display:none}}`}</style>

          <div className="hide-sm">
            <div className="topbar-title" style={{ fontSize: 'var(--fs-base)', fontWeight: 600 }}>{shop?.name ?? 'فروشگاه شما'}</div>
            <div className="topbar-sub">{meta.title}</div>
          </div>

          <div className="topbar-actions">
            <Link href="/app/assistant" className="btn btn-soft btn-sm hide-sm">
              <IconSparkles size={15} />
              تست پاسخ
            </Link>
            <button type="button" className="btn btn-outline btn-icon hide-sm" aria-label="اعلان‌ها" title="اعلان‌ها">
              <IconBell size={17} />
            </button>
            <div className="row hide-sm" style={{ gap: 8, paddingInlineStart: 4 }}>
              <span className="avatar avatar-brand">{(shop?.name ?? 'ف').trim().charAt(0)}</span>
              <div style={{ lineHeight: 1.4 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{shop?.name ?? 'فروشگاه'}</div>
                <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>مالک فروشگاه</div>
              </div>
            </div>
          </div>
        </header>

        <main className="page">{children}</main>
      </div>
    </div>
  );
}
