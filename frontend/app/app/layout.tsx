'use client';

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { Spinner } from '@/components/ui';
import { NotificationBell } from '@/components/notifications';
import { ThemeToggle } from '@/components/theme';
import {
  IconBox, IconChat, IconDashboard, IconLogout, IconMenu, IconWallet,
  IconSettings, IconSparkles, IconStore, IconUpload, IconUsers, IconX,
} from '@/components/icons';

type NavItem = { href: string; label: string; icon: typeof IconDashboard; exact?: boolean };
const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: 'نمای کلی',
    items: [
      { href: '/app', label: 'داشبورد', icon: IconDashboard, exact: true },
    ],
  },
  {
    label: 'فروشگاه',
    items: [
      { href: '/app/products', label: 'محصولات و موجودی', icon: IconBox },
      { href: '/app/orders', label: 'سفارش‌ها', icon: IconWallet },
      { href: '/app/import', label: 'ورود کاتالوگ', icon: IconUpload },
    ],
  },
  {
    label: 'مشتریان',
    items: [
      { href: '/app/conversations', label: 'گفت‌وگوها', icon: IconChat },
      { href: '/app/customers', label: 'مشتریان', icon: IconUsers },
    ],
  },
  {
    label: 'هوش مصنوعی',
    items: [
      { href: '/app/assistant', label: 'دستیار پاسخ‌گو', icon: IconSparkles },
      { href: '/app/settings', label: 'تنظیمات فروشگاه', icon: IconSettings },
    ],
  },
];

const TITLES: Record<string, { title: string; sub: string }> = {
  '/app': { title: 'داشبورد', sub: 'تصویر کلی فروشگاه در یک نگاه' },
  '/app/products': { title: 'محصولات و موجودی', sub: 'کاتالوگ، واریانت‌ها و دفتر گردش' },
  '/app/conversations': { title: 'گفت‌وگوها', sub: 'همه‌ی چت‌های تلگرام، بی‌واسطه و از همین‌جا' },
  '/app/customers': { title: 'مشتریان', sub: 'هر کسی که یک بار با فروشگاه شما حرف زده' },
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
      <Link href="/" className="brand" aria-label="فروش‌یار — رفتن به صفحهٔ اصلی">
        <span className="brand-mark"><Image src="/brand/robot-face-mark.png" alt="" width={30} height={30} priority style={{ width: 30, height: 30, objectFit: 'contain' }} /></span>
        <div>
          <div className="brand-name">فروش‌یار</div>
          <div className="brand-sub">رفتن به سایت اصلی</div>
        </div>
      </Link>

      {NAV_GROUPS.map(group => (
        <div className="nav-group" key={group.label}>
          <div className="nav-label">{group.label}</div>
          {group.items.map(item => (
            <Link key={item.href} href={item.href} className={`nav-item ${isActive(item.href, item.exact) ? 'active' : ''}`}>
              <item.icon className="nav-icon" />
              <span>{item.label}</span>
            </Link>
          ))}
        </div>
      ))}

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
          <style>{`@media (max-width: 900px){#nav-toggle{display:inline-flex !important} .sidebar .hide-sm{display:inline-flex !important} .topbar .topbar-heading{display:block !important; min-width:0; flex:1 1 auto} .topbar .topbar-title{overflow:hidden; text-overflow:ellipsis; white-space:nowrap} .topbar-sub{display:none}}`}</style>

          <div className="topbar-heading hide-sm">
            <div className="topbar-title" style={{ fontSize: 'var(--fs-base)', fontWeight: 600 }}>{shop?.name ?? 'فروشگاه شما'}</div>
            <div className="topbar-sub">{meta.title}</div>
          </div>

          <div className="topbar-actions">
            <Link href="/app/assistant" className="btn btn-soft btn-sm hide-sm">
              <IconSparkles size={15} />
              تست پاسخ
            </Link>
            <NotificationBell />
            <ThemeToggle />
            <span className="topbar-divider hide-sm" aria-hidden="true" />
            <button
              type="button"
              className="topbar-user hide-sm"
              onClick={logout}
              title="خروج از حساب"
            >
              <span className="avatar avatar-brand">{(shop?.name ?? 'ف').trim().charAt(0)}</span>
              <span className="topbar-user-text">
                <span className="topbar-user-name">{shop?.name ?? 'فروشگاه شما'}</span>
                <span className="topbar-user-role">مالک فروشگاه</span>
              </span>
              <IconLogout size={15} className="topbar-user-exit" />
            </button>
          </div>
        </header>

        <main className="page">{children}</main>
      </div>
    </div>
  );
}
