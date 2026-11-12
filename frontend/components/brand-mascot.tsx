'use client';

/** @deprecated expressionها دیگر انیمیشن ندارند؛ فقط برای سازگاری API نگه داشته شده. */
export type MascotExpression =
  | 'idle' | 'smile' | 'laugh' | 'wink' | 'surprised' | 'hearts'
  | 'thinking' | 'wave' | 'squint' | 'dizzy';

type Props = {
  size?: number;
  /** @deprecated نادیده گرفته می‌شود؛ ماسکات فقط پلک می‌زند و (در صورت float) شناور می‌شود. */
  expression?: MascotExpression;
  /** پلک‌زدن؛ با prefers-reduced-motion خاموش می‌شود. */
  animated?: boolean;
  /** شناورشدن ملایم بالا/پایین (حس زنده‌بودن)؛ لوگو خاموش است، صفحه روشن. */
  float?: boolean;
  className?: string;
  /** 'face' = فقط صورت (برای لوگو)؛ 'full' = صورت+گردن+شانه (برای صفحه). */
  variant?: 'face' | 'full';
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
    { left: 27.0, top: 62.8, w: 17.9, h: 8.6 },
    { left: 54.6, top: 61.8, w: 19.7, h: 9.7 },
  ],
};

/**
 * ماسکات فروش‌یار — ربات سه‌بعدی تأییدشده با شخصیت کول.
 *
 * فقط دو حرکت دارد: پلک‌زدن (`.robot-eyelid` روی چشم‌ها) و در صورت `float`
 * شناورشدن ملایم بالا/پایین. هیچ چرخش/واکنش/ترانسفورم دیگری نیست تا طراحی
 * تأییدشده دقیقاً همان بماند.
 */
export function BrandMascot({ size = 30, animated = true, float = false, className, variant = 'full' }: Props) {
  const src = variant === 'face' ? '/brand/robot-face.png' : '/brand/robot-face-mark.png';
  return (
    <span
      className={`brand-mascot ${animated ? 'brand-mascot-animated' : ''} ${float ? 'brand-mascot-float' : ''} ${className ?? ''}`}
      role="img"
      aria-label="فروش‌یار"
      style={{
        position: 'relative',
        display: 'inline-block',
        width: size,
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
