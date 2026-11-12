'use client';

export type MascotExpression =
  | 'idle' | 'smile' | 'laugh' | 'wink' | 'surprised' | 'hearts'
  | 'thinking' | 'wave' | 'squint' | 'dizzy';

type Props = {
  size?: number;
  expression?: MascotExpression;
  /** پلک‌زدن و شناورشدن؛ با prefers-reduced-motion خاموش می‌شود. */
  animated?: boolean;
  className?: string;
  /** 'face' = فقط صورت (برای لوگو)؛ 'full' = صورت+گردن+شانه (برای صفحه). */
  variant?: 'face' | 'full';
};

const EXPRESSION_TRANSFORM: Record<MascotExpression, string> = {
  idle: 'none',
  smile: 'translateY(-2%)',
  laugh: 'translateY(-4%) rotate(-2deg)',
  wink: 'rotate(3deg)',
  surprised: 'translateY(-5%) scale(1.04)',
  hearts: 'translateY(-3%)',
  thinking: 'rotate(-4deg)',
  wave: 'rotate(4deg)',
  squint: 'scaleY(.96)',
  dizzy: 'rotate(-6deg)',
};

/**
 * جعبه‌های پلک به‌درصد از ابعاد تصویر — از روی خودِ تصویر ربات (پیکسل‌های
 * فیروزه‌ای چشم‌ها) تشخیص داده شده‌اند تا دقیقاً روی چشم‌های نورانی بنشینند.
 * با کمی حاشیه تا هاله‌ی نور چشم هم پوشش داده شود.
 */
const EYES: Record<'face' | 'full', { left: number; top: number; w: number; h: number }[]> = {
  full: [
    { left: 31.6, top: 41.4, w: 14.3, h: 6.9 },
    { left: 53.7, top: 40.6, w: 15.7, h: 7.7 },
  ],
  face: [
    { left: 25.8, top: 60.3, w: 18.8, h: 9.2 },
    { left: 54.8, top: 59.2, w: 20.7, h: 10.4 },
  ],
};

/**
 * ماسکات فروش‌یار — ربات سه‌بعدی تأییدشده با شخصیت کول.
 *
 * تصویر PNG با پس‌زمینه‌ی شفاف است و پلک‌ها (`.robot-eyelid`) روی چشم‌ها
 * قرار می‌گیرند تا ربات پلک بزند؛ طراحی دقیقاً همان تصویر تأییدشده می‌ماند.
 * expressionها با حرکت‌های ظریف روی کل ماسکات بازنمایی می‌شوند.
 */
export function BrandMascot({ size = 30, expression = 'idle', animated = true, className, variant = 'full' }: Props) {
  const src = variant === 'face' ? '/brand/robot-face.png' : '/brand/robot-face-mark.png';
  return (
    <span
      className={`brand-mascot mascot-${expression} ${animated ? 'brand-mascot-animated' : ''} ${className ?? ''}`}
      role="img"
      aria-label="فروش‌یار"
      style={{
        position: 'relative',
        display: 'inline-block',
        width: size,
        transform: EXPRESSION_TRANSFORM[expression],
        transition: 'transform .35s cubic-bezier(.22,1,.36,1)',
        flex: '0 0 auto',
        lineHeight: 0,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        width={size}
        draggable={false}
        style={{ width: '100%', height: 'auto', display: 'block', userSelect: 'none' }}
      />
      {EYES[variant].map((e, i) => (
        <span
          key={i}
          className="robot-eyelid"
          aria-hidden="true"
          style={{ left: `${e.left}%`, top: `${e.top}%`, width: `${e.w}%`, height: `${e.h}%` }}
        />
      ))}
    </span>
  );
}
