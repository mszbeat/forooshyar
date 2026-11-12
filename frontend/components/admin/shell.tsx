'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { adminApi, adminToken, AdminError, type AdminIdentity, type Overview } from '@/lib/admin';
import { Spinner } from '@/components/ui';
import { ThemeToggle } from '@/components/theme';
import {
  IconAlertCircle, IconBolt, IconDashboard, IconLogout, IconMenu, IconSettings, IconShield,
  IconSparkles, IconStore, IconWallet, IconX,
} from '@/components/icons';

const NAV = [
  { href: '/admin', label: 'نمای کلی', icon: IconDashboard, exact: true, note: 'overview' },
  { href: '/admin/shops', label: 'فروشگاه‌ها', icon: IconStore, note: 'shops' },
  { href: '/admin/ai', label: 'هوش مصنوعی', icon: IconSparkles, note: 'ai' },
  { href: '/admin/telegram', label: 'تلگرام و ربات', icon: IconBolt, note: 'telegram' },
  { href: '/admin/integrations', label: 'یکپارچه‌سازی‌ها', icon: IconBolt, note: 'integrations' },
  { href: '/admin/payments', label: 'پرداخت', icon: IconWallet, note: 'payments' },
  { href: '/admin/otp', label: 'SMS و OTP', icon: IconShield, note: 'otp' },
  { href: '/admin/plans', label: 'پلن‌ها', icon: IconWallet, note: 'plans' },
  { href: '/admin/database', label: 'دیتابیس', icon: IconStore, note: 'database' },
  { href: '/admin/system', label: 'سیستم و امنیت', icon: IconSettings, note: 'system' },
  { href: '/admin/account', label: 'حساب ادمین', icon: IconShield, note: 'account' },
];

const TITLES: Record<string, { title: string; crumb: string }> = {
  '/admin': { title: 'نمای کلی پلتفرم', crumb: 'CONTROL ROOM' },
  '/admin/shops': { title: 'مدیریت فروشگاه‌ها', crumb: 'SHOPS · ACCOUNTS' },
  '/admin/ai': { title: 'مدل هوش مصنوعی', crumb: 'AI · MODEL ROUTING' },
  '/admin/telegram': { title: 'تلگرام و ربات', crumb: 'BOT · WEBHOOK' },
  '/admin/payments': { title: 'درگاه پرداخت', crumb: 'PAYMENTS' },
  '/admin/otp': { title: 'پیامک و OTP', crumb: 'OTP' },
  '/admin/plans': { title: 'پلن‌های اشتراک', crumb: 'PLANS · BILLING' },
  '/admin/database': { title: 'دیتابیس', crumb: 'POSTGRES · PERSISTENCE' },
  '/admin/system': { title: 'سیستم و امنیت', crumb: 'SYSTEM · CORS · CACHE' },
  '/admin/account': { title: 'حساب ادمین', crumb: 'ACCOUNT · SECURITY' },
};

/** وضعیت‌های بالای صفحه؛ سبک و مستقل از صفحه‌ی جاری. */
export function usePlatformStatus() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const reload = useCallback(() => {
    adminApi.overview().then(setOverview).catch(() => setOverview(null));
  }, []);
  useEffect(() => { reload(); }, [reload]);
  return { overview, reload };
}

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [admin, setAdmin] = useState<AdminIdentity | null>(null);
  // منوی موبایل: در عرض کم، نوار کنار جمع می‌شود و از همین دکمه باز/بسته می‌شود.
  const [navOpen, setNavOpen] = useState(false);
  const [state, setState] = useState<'loading' | 'ready' | 'out'>('loading');
  const { overview } = usePlatformStatus();

  useEffect(() => {
    if (!adminToken.get()) { setState('out'); router.replace('/admin/login'); return; }
    adminApi.me()
      .then(identity => { setAdmin(identity); setState('ready'); })
      .catch((problem: unknown) => {
        if (problem instanceof AdminError && problem.status === 401) { setState('out'); router.replace('/admin/login'); }
        else setState('ready');
      });
  }, [router]);

  if (state !== 'ready') {
    return (
      <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', color: 'var(--brand)' }}>
        <div style={{ display: 'grid', justifyItems: 'center', gap: 12 }}>
          <Spinner size={24} />
          <span className="small muted">در حال باز کردن اتاق کنترل…</span>
        </div>
      </div>
    );
  }

  const meta = TITLES[pathname] ?? { title: 'پنل ادمین', crumb: 'ADMIN' };
  const ai = overview?.services.ai;
  const bot = overview?.services.telegram;
  const db = overview?.services.database;

  return (
    <div className={`adm-shell${navOpen ? ' nav-open' : ''}`}>
      {/* در موبایل، لایه‌ی تاریک پشت منو؛ با لمس بیرون بسته می‌شود. */}
      <button
        type="button" className="adm-scrim" aria-label="بستن منو"
        onClick={() => setNavOpen(false)} tabIndex={navOpen ? 0 : -1}
      />
      <aside className="adm-side">
        <div className="adm-brand">
          <span className="glyph"><IconShield size={19} /></span>
          <div>
            <div className="nm">فروش‌یار</div>
            <div className="rl">ADMIN</div>
          </div>
          <button
            type="button" className="adm-nav-toggle btn btn-ghost btn-icon btn-sm"
            aria-label={navOpen ? 'بستن منو' : 'باز کردن منو'} aria-expanded={navOpen}
            onClick={() => setNavOpen(open => !open)}
          >
            {navOpen ? <IconX size={17} /> : <IconMenu size={17} />}
          </button>
        </div>

        <nav className="adm-nav">
          <div className="adm-nav-lab">پیکربندی</div>
          {NAV.map(item => {
            const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} className={`adm-nav-item${active ? ' active' : ''}`} onClick={() => setNavOpen(false)}>
                <Icon size={16} />
                <span>{item.label}</span>
                <span className="sp">{item.note}</span>
              </Link>
            );
          })}
          <div className="adm-nav-lab">دسترسی سریع</div>
          <Link href="/app" className="adm-nav-item" onClick={() => setNavOpen(false)}>
            <IconStore size={16} />
            <span>پنل فروشنده</span>
          </Link>
          <Link href="/" className="adm-nav-item" onClick={() => setNavOpen(false)}>
            <IconDashboard size={16} />
            <span>سایت اصلی</span>
          </Link>
        </nav>

        <div className="adm-side-foot">
          {/* یک کارتِ واحد با سه ردیف هم‌عرض: قبلاً سه کارت جداگانه بود که هرکدام
              عرض خودش را می‌گرفت و از لبه‌ی سایدبار بیرون می‌زد. */}
          <div className="adm-status" role="status" aria-label="وضعیت سرویس‌ها">
            <div className="row0">
              <span className="ico"><IconSparkles size={13} /></span>
              <span className="nm">مدل زبانی</span>
              <span className={`vl ${ai?.ready ? 'on' : ai?.enabled ? '' : 'off'}`}>
                {ai?.ready ? 'READY' : ai?.enabled ? 'WAIT' : 'OFF'}
              </span>
            </div>
            <div className="row0">
              <span className="ico" style={bot?.configured ? undefined : { color: '#f3ccc5' }}><IconBolt size={13} /></span>
              <span className="nm">ربات تلگرام</span>
              <span className={`vl ${bot?.configured ? 'on' : 'off'}`}>{bot?.configured ? 'ONLINE' : 'OFF'}</span>
            </div>
            <div className="row0">
              <span className="ico" style={db ? undefined : { color: '#f3ccc5' }}><IconStore size={13} /></span>
              <span className="nm">دیتابیس</span>
              <span className={`vl ${db ? 'on' : 'off'}`}>{db ? `${db.latencyMs}ms` : 'DOWN'}</span>
            </div>
          </div>

          <div className="adm-ident">
            <span className="av">{(admin?.name || 'AD').slice(0, 2)}</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700 }}>{admin?.name || 'مدیر سامانه'}</div>
              <div className="em">{admin?.email ?? ''}</div>
            </div>
            <button
              type="button" className="btn btn-ghost btn-icon btn-sm" style={{ marginInlineStart: 'auto', color: 'inherit' }}
              aria-label="خروج" title="خروج از پنل ادمین"
              onClick={() => { adminToken.clear(); router.replace('/admin/login'); }}
            >
              <IconLogout size={15} />
            </button>
          </div>
        </div>
      </aside>

      <main className="adm-main">
        <header className="adm-top">
          <button
            type="button" className="adm-mobile-menu btn btn-ghost btn-icon btn-sm"
            aria-label="باز کردن منوی ادمین" aria-expanded={navOpen}
            onClick={() => setNavOpen(open => !open)}
          >
            {navOpen ? <IconX size={17} /> : <IconMenu size={17} />}
          </button>
          <div className="adm-top-title">
            <div className="crumbs">{meta.crumb}</div>
            <h1>{meta.title}</h1>
          </div>
          <div className="sp">
            <ThemeToggle className="adm-theme-toggle" />
            <span className={`adm-pipe ${ai?.ready ? 'on' : ai?.enabled ? 'warn' : 'off'}`}>
              <i /><span className="mono">AI</span>
            </span>
            <span className={`adm-pipe ${bot?.configured ? 'on' : 'off'}`}><i /><span className="mono">BOT</span></span>
            <span className={`adm-pipe ${db ? 'on' : 'off'}`}><i /><span className="mono">DB</span></span>
            {overview && overview.restartRequired.length > 0 && (
              <span className="adm-pipe warn"><i /><IconAlertCircle size={12} /> نیازمند ری‌استارت</span>
            )}
          </div>
        </header>
        <div className="adm-body">{children}</div>
      </main>
    </div>
  );
}
