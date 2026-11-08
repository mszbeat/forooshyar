'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { AdminShell } from '@/components/admin/shell';

/**
 * چیدمان پنل ادمین.
 *
 * صفحه‌ی ورود بدون پوسته رندر می‌شود (وگرنه خودِ فرمِ ورود پشت یک نگهبان
 * ریدایرکت می‌شد). بقیه‌ی مسیرها با `AdminShell` محافظت می‌شوند.
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname === '/admin/login') return <>{children}</>;
  return <AdminShell>{children}</AdminShell>;
}
