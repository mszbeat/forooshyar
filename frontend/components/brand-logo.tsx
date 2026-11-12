'use client';

import { useId } from 'react';

type Props = {
  size?: number;
  /** پلک‌زدن چشم‌ها؛ با prefers-reduced-motion خودکار خاموش می‌شود. */
  animated?: boolean;
  className?: string;
};

/**
 * نشان برند فروش‌یار — نسخه‌ی SVG متحرکِ همان رباتِ صورت‌تیره با چشم‌های نئونی.
 * چشم‌ها هر چند ثانیه یک‌بار پلک می‌زنند؛ در حالت کاهش حرکت، ثابت می‌مانند.
 */
export function BrandLogo({ size = 30, animated = true, className }: Props) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const headId = `brand-head-${uid}`;
  const faceId = `brand-face-${uid}`;
  const eyeId = `brand-eye-${uid}`;
  const glowId = `brand-glow-${uid}`;

  return (
    <svg
      className={`brand-logo ${animated ? 'brand-logo-animated' : ''} ${className ?? ''}`}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="فروش‌یار"
    >
      <defs>
        <linearGradient id={headId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#dbe3f0" />
        </linearGradient>
        <linearGradient id={faceId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1a2a4a" />
          <stop offset="100%" stopColor="#070d1a" />
        </linearGradient>
        <linearGradient id={eyeId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7ef0ff" />
          <stop offset="100%" stopColor="#22d3ee" />
        </linearGradient>
        <filter id={glowId} x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="1.8" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* سر سفید ربات */}
      <rect x="7" y="9" width="50" height="46" rx="17" fill={`url(#${headId})`} stroke="rgba(11,13,18,.10)" strokeWidth="1" />
      {/* صفحه‌ی صورت تیره */}
      <rect x="13" y="15" width="38" height="34" rx="13" fill={`url(#${faceId})`} />
      {/* نور حاشیه‌ی فیروزه‌ای */}
      <rect x="13" y="15" width="38" height="34" rx="13" fill="none" stroke="#22d3ee" strokeOpacity=".6" strokeWidth="1.2" />

      {/* چشم‌های خندان — پلک‌زن */}
      <g className="brand-eyes" filter={`url(#${glowId})`}>
        <path d="M19 33 Q24 39.5 29 33 Q24 35.8 19 33 Z" fill={`url(#${eyeId})`} />
        <path d="M35 33 Q40 39.5 45 33 Q40 35.8 35 33 Z" fill={`url(#${eyeId})`} />
      </g>
    </svg>
  );
}
