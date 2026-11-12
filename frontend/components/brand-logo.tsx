'use client';

import { BrandMascot } from '@/components/brand-mascot';

type Props = {
  size?: number;
  /** پلک‌زدن چشم‌ها؛ با prefers-reduced-motion خودکار خاموش می‌شود. */
  animated?: boolean;
  className?: string;
};

/**
 * نشان برند فروش‌یار — ماسکات با چشم‌های گرد و پلک‌زن.
 * پیاده‌سازی در `BrandMascot` است تا در لندینگ هم با expressionهای
 * تعاملی استفاده شود؛ این کامپوننت فقط wrapper سازگار با API قبلی است.
 */
export function BrandLogo({ size = 30, animated = true, className }: Props) {
  return <BrandMascot size={size} animated={animated} className={className} />;
}
