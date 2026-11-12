'use client';

import { BrandMascot } from '@/components/brand-mascot';

type Props = {
  size?: number;
  /** پلک‌زدن چشم‌ها؛ با prefers-reduced-motion خودکار خاموش می‌شود. */
  animated?: boolean;
  className?: string;
};

/**
 * نشان برند فروش‌یار — در بخش لوگو فقط «صورت» ربات نمایش داده می‌شود
 * (نسخه‌ی face)؛ در صفحه (هیرو/ماسکات شناور) نسخه‌ی کامل با گردن و شانه است.
 * پیاده‌سازی در `BrandMascot` است.
 */
export function BrandLogo({ size = 30, animated = true, className }: Props) {
  return <BrandMascot size={size} animated={animated} className={className} variant="face" />;
}
