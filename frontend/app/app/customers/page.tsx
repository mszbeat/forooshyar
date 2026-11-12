'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Spinner } from '@/components/ui';

/**
 * مشتریان در صفحه‌ی گفتگوها ادغام شده‌اند (سوییچ «گفتگوها | مشتریان»).
 * این مسیر فقط برای لینک‌های قدیمی/اعلان‌ها نگه داشته شده و به همان‌جا
 * ریدایرکت می‌کند.
 */
export default function CustomersRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/app/conversations'); }, [router]);
  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: '40dvh', color: 'var(--brand)' }}>
      <Spinner size={24} />
    </div>
  );
}
