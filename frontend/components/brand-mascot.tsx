'use client';

import { useId } from 'react';

export type MascotExpression =
  | 'idle' | 'smile' | 'laugh' | 'wink' | 'surprised' | 'hearts'
  | 'thinking' | 'wave' | 'squint' | 'dizzy';

type Props = {
  size?: number;
  expression?: MascotExpression;
  /** پلک‌زدن خودکار؛ با prefers-reduced-motion خاموش می‌شود. */
  animated?: boolean;
  className?: string;
};

/**
 * ماسکات فروش‌یار — صورت ربات با چشم‌های گرد و هایلایت.
 *
 * چشم‌ها دایره‌اند (نه خط افقی) تا صورت «خواب‌آلود/غمگین» خوانده نشود.
 * پلک‌زدن با CSS انجام می‌شود (scaleY روی گروه چشم‌ها) و در حالت کاهش
 * حرکت خاموش است. expression برای واکنش‌های تعاملی لندینگ است.
 */
export function BrandMascot({ size = 30, expression = 'idle', animated = true, className }: Props) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const headId = `mascot-head-${uid}`;
  const faceId = `mascot-face-${uid}`;
  const eyeId = `mascot-eye-${uid}`;
  const glowId = `mascot-glow-${uid}`;

  const eyes = renderEyes(expression, eyeId);
  const mouth = renderMouth(expression);

  return (
    <svg
      className={`brand-mascot mascot-${expression} ${animated ? 'brand-mascot-animated' : ''} ${className ?? ''}`}
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

      {/* آنتن */}
      <line x1="32" y1="9" x2="32" y2="4" stroke="#8b9bb4" strokeWidth="2" strokeLinecap="round" />
      <circle cx="32" cy="3.5" r="2.2" fill="#22d3ee" />

      {/* سر سفید ربات */}
      <rect x="7" y="9" width="50" height="46" rx="17" fill={`url(#${headId})`} stroke="rgba(11,13,18,.10)" strokeWidth="1" />
      {/* صفحه‌ی صورت تیره */}
      <rect x="13" y="15" width="38" height="34" rx="13" fill={`url(#${faceId})`} />
      {/* نور حاشیه‌ی فیروزه‌ای */}
      <rect x="13" y="15" width="38" height="34" rx="13" fill="none" stroke="#22d3ee" strokeOpacity=".6" strokeWidth="1.2" />

      {/* گونه‌ها */}
      {(expression === 'smile' || expression === 'laugh' || expression === 'squint' || expression === 'hearts') && (
        <g opacity=".55">
          <ellipse cx="18.5" cy="40" rx="3.4" ry="2.2" fill="#ff8fab" />
          <ellipse cx="45.5" cy="40" rx="3.4" ry="2.2" fill="#ff8fab" />
        </g>
      )}

      {/* چشم‌ها — پلک‌زن */}
      <g className="brand-eyes" filter={`url(#${glowId})`}>{eyes}</g>

      {/* دهان */}
      <g className="brand-mouth">{mouth}</g>
    </svg>
  );
}

function renderEyes(expression: MascotExpression, eyeId: string) {
  const fill = `url(#${eyeId})`;
  switch (expression) {
    case 'wink':
      return (
        <>
          <circle cx="24" cy="32" r="4.2" fill={fill} />
          <circle cx="25.4" cy="30.6" r="1.4" fill="#eafcff" />
          <path d="M35 33.5 Q40 36.5 45 33.5" stroke={fill} strokeWidth="2.4" fill="none" strokeLinecap="round" />
        </>
      );
    case 'surprised':
      return (
        <>
          <circle cx="24" cy="31" r="5.4" fill={fill} />
          <circle cx="40" cy="31" r="5.4" fill={fill} />
          <circle cx="25.6" cy="29.4" r="1.7" fill="#eafcff" />
          <circle cx="41.6" cy="29.4" r="1.7" fill="#eafcff" />
        </>
      );
    case 'hearts':
      return (
        <>
          <path d="M24 35.5 C20 32 19 28.5 21.5 26.5 C23 25.3 24.8 26 24 27.5 C23.2 26 25 25.3 26.5 26.5 C29 28.5 28 32 24 35.5 Z" fill="#ff6b9d" />
          <path d="M40 35.5 C36 32 35 28.5 37.5 26.5 C39 25.3 40.8 26 40 27.5 C39.2 26 41 25.3 42.5 26.5 C45 28.5 44 32 40 35.5 Z" fill="#ff6b9d" />
        </>
      );
    case 'squint':
      return (
        <>
          <path d="M19 33 Q24 29 29 33" stroke={fill} strokeWidth="2.6" fill="none" strokeLinecap="round" />
          <path d="M35 33 Q40 29 45 33" stroke={fill} strokeWidth="2.6" fill="none" strokeLinecap="round" />
        </>
      );
    case 'dizzy':
      return (
        <>
          <path d="M20 29 L28 35 M28 29 L20 35" stroke={fill} strokeWidth="2.4" strokeLinecap="round" />
          <path d="M36 29 L44 35 M44 29 L36 35" stroke={fill} strokeWidth="2.4" strokeLinecap="round" />
        </>
      );
    case 'thinking':
      return (
        <>
          <circle cx="24" cy="30" r="4" fill={fill} />
          <circle cx="40" cy="30" r="4" fill={fill} />
          <circle cx="25.4" cy="28.6" r="1.3" fill="#eafcff" />
          <circle cx="41.4" cy="28.6" r="1.3" fill="#eafcff" />
        </>
      );
    default:
      // idle / smile / laugh / wave — چشم‌های گرد با هایلایت
      return (
        <>
          <circle cx="24" cy="32" r="4.2" fill={fill} />
          <circle cx="40" cy="32" r="4.2" fill={fill} />
          <circle cx="25.4" cy="30.6" r="1.4" fill="#eafcff" />
          <circle cx="41.4" cy="30.6" r="1.4" fill="#eafcff" />
        </>
      );
  }
}

function renderMouth(expression: MascotExpression) {
  const stroke = '#7ef0ff';
  switch (expression) {
    case 'laugh':
      return <path d="M24 40 Q32 48 40 40 Q32 44 24 40 Z" fill={stroke} />;
    case 'smile':
    case 'squint':
    case 'hearts':
      return <path d="M25 40 Q32 45.5 39 40" stroke={stroke} strokeWidth="2.4" fill="none" strokeLinecap="round" />;
    case 'surprised':
      return <ellipse cx="32" cy="42" rx="3.4" ry="4" fill={stroke} />;
    case 'thinking':
      return <path d="M27 42 Q32 40.5 37 42" stroke={stroke} strokeWidth="2.2" fill="none" strokeLinecap="round" />;
    case 'dizzy':
      return <path d="M25 43 Q28.5 40.5 32 43 Q35.5 45.5 39 43" stroke={stroke} strokeWidth="2.2" fill="none" strokeLinecap="round" />;
    case 'wave':
      return <path d="M25 40 Q32 46 39 40" stroke={stroke} strokeWidth="2.4" fill="none" strokeLinecap="round" />;
    default:
      return <path d="M26 40.5 Q32 44 38 40.5" stroke={stroke} strokeWidth="2.2" fill="none" strokeLinecap="round" />;
  }
}
