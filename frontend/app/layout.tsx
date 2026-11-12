import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './fonts.css';
import './globals.css';
import { AuthProvider } from '@/lib/auth';
import { ToastProvider } from '@/components/ui';
import { MotionBoot } from '@/components/reveal';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://forooshyar.ir'),
  title: 'فروش‌یار — دستیار فروش فارسی برای فروشگاه‌های آنلاین',
  description:
    'فروش‌یار به سؤال‌های مشتریان شما در تلگرام و اینستاگرام از کاتالوگ زنده فروشگاه پاسخ می‌دهد؛ قیمت و موجودی همیشه از دیتابیس خودتان می‌آید.',
  applicationName: 'فروش‌یار',
  keywords: ['فروش‌یار', 'دستیار فروش', 'فروشگاه اینستاگرام', 'پاسخ خودکار', 'پنل فروشنده'],
  openGraph: {
    type: 'website',
    locale: 'fa_IR',
    siteName: 'فروش‌یار',
    title: 'فروش‌یار — دستیار فروش فارسی',
    description:
      'پاسخ خودکار به مشتریان در تلگرام و اینستاگرام، از کاتالوگ زنده فروشگاه شما؛ قیمت و موجودی همیشه واقعی.',
    images: ['/brand/robot-face-mark.png'],
  },
  twitter: {
    card: 'summary',
    title: 'فروش‌یار — دستیار فروش فارسی',
    description:
      'پاسخ خودکار به مشتریان در تلگرام و اینستاگرام، از کاتالوگ زنده فروشگاه شما؛ قیمت و موجودی همیشه واقعی.',
    images: ['/brand/robot-face-mark.png'],
  },
};

export const viewport: Viewport = {
  themeColor: '#08090a',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fa" dir="rtl" suppressHydrationWarning>
      <head>
        {/* اعمال تم پیش از رنگ‌آمیزی اول — پیش‌فرض تیره (امضای Aurora) */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('forooshyar.theme');if(t!=='dark'&&t!=='light'){t='dark';}document.documentElement.dataset.theme=t;document.documentElement.style.colorScheme=t;}catch(e){document.documentElement.dataset.theme='dark';}})();`,
          }}
        />
      </head>
      <body>
        <MotionBoot />
        <AuthProvider>
          <ToastProvider>{children}</ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
