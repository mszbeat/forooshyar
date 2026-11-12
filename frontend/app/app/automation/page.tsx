'use client';

import { PageHeader } from '@/components/ui';
import { AutomationSection } from '@/components/automation-section';

/**
 * اتوماسیون — کامنت اینستاگرام به دایرکت.
 *
 * مشتری زیر پست کامنت می‌گذارد؛ پاسخ عمومی داده می‌شود و بعد دایرکت
 * می‌رود. هر اتوماسیون تریگر، پاسخ‌های عمومی، متن دایرکت و سقف روزانه‌ی
 * خودش را دارد و هر کامنت فقط یک‌بار اجرا می‌شود.
 */
export default function AutomationPage() {
  return (
    <div className="stack">
      <PageHeader
        eyebrow="اتوماسیون"
        title="اتوماسیون کامنت به دایرکت"
        description="وقتی مشتری زیر پست کامنت می‌گذارد، پاسخ عمومی می‌گیرد و بعد دایرکت می‌رود."
      />
      <AutomationSection />
    </div>
  );
}
