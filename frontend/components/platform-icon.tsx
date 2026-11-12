'use client';

type Platform = 'INSTAGRAM' | 'TELEGRAM' | 'BALE' | 'RUBIKA';

const ICONS: Record<Platform, string> = {
  INSTAGRAM: '/icons/instagram.jpg',
  TELEGRAM: '/icons/telegram.svg',
  BALE: '/icons/bale.jpg',
  RUBIKA: '/icons/rubika.png',
};

const NAMES: Record<Platform, string> = {
  INSTAGRAM: 'اینستاگرام',
  TELEGRAM: 'تلگرام',
  BALE: 'بله',
  RUBIKA: 'روبیکا',
};

/** آیکن رسمی هر پلتفرم (از اینترنت گرفته شده و در public/icons میزبانی می‌شود). */
export function PlatformIcon({ platform, size = 40, rounded = true }: { platform: Platform; size?: number; rounded?: boolean }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={ICONS[platform]}
      alt={NAMES[platform]}
      width={size}
      height={size}
      style={{
        width: size,
        height: size,
        objectFit: 'cover',
        borderRadius: rounded ? Math.round(size * 0.24) : 0,
        flex: '0 0 auto',
        display: 'block',
      }}
    />
  );
}
