'use client';

export type MascotExpression =
  | 'idle' | 'smile' | 'laugh' | 'wink' | 'surprised' | 'hearts'
  | 'thinking' | 'wave' | 'squint' | 'dizzy';

type Props = {
  size?: number;
  expression?: MascotExpression;
  /** انیمیشن شناور/پلک‌زدن؛ با prefers-reduced-motion خاموش می‌شود. */
  animated?: boolean;
  className?: string;
};

/**
 * ماسکات فروش‌یار — ربات سه‌بعدی با شخصیت کول (تصویر تأییدشده‌ی کاربر).
 *
 * تصویر PNG با پس‌زمینه‌ی شفاف است (`/brand/robot-face-mark.png`) و در
 * همه‌ی اندازه‌ها (۱۶ تا ۵۱۲) واضح می‌ماند. expressionها روی تصویر ثابت
 * با حرکت‌های ظریف (چرخش/جهش) بازنمایی می‌شوند تا واکنش‌های تعاملی
 * لندینگ و ماسکات شناور حفظ شود.
 */
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

export function BrandMascot({ size = 30, expression = 'idle', animated = true, className }: Props) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/brand/robot-face-mark.png"
      alt="فروش‌یار"
      width={size}
      height={size}
      draggable={false}
      className={`brand-mascot mascot-${expression} ${animated ? 'brand-mascot-animated' : ''} ${className ?? ''}`}
      style={{
        width: size,
        height: size,
        objectFit: 'contain',
        transform: EXPRESSION_TRANSFORM[expression],
        transition: 'transform .35s cubic-bezier(.22,1,.36,1)',
        userSelect: 'none',
      }}
    />
  );
}
