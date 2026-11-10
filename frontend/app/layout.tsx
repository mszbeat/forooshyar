import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './fonts.css';
import './globals.css';
import { AuthProvider } from '@/lib/auth';
import { ToastProvider } from '@/components/ui';

export const metadata: Metadata = {
  title: 'فروش‌یار — دستیار فروش فارسی برای فروشگاه‌های آنلاین',
  description:
    'فروش‌یار به سؤال‌های مشتریان شما در تلگرام و اینستاگرام از کاتالوگ زنده فروشگاه پاسخ می‌دهد؛ قیمت و موجودی همیشه از دیتابیس خودتان می‌آید.',
  applicationName: 'فروش‌یار',
  keywords: ['فروش‌یار', 'دستیار فروش', 'فروشگاه اینستاگرام', 'پاسخ خودکار', 'پنل فروشنده'],
};

export const viewport: Viewport = {
  themeColor: '#0f7a6a',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fa" dir="rtl">
      <head>
        {/* اعمال تم پیش از رنگ‌آمیزی اول — جلوگیری از پرشِ سفید به تیره */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('forooshyar.theme');if(t!=='dark'&&t!=='light'){t=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'light':'light';}document.documentElement.dataset.theme=t;document.documentElement.style.colorScheme=t;}catch(e){}})();`,
          }}
        />
      </head>
      <body>
        <AuthProvider>
          <ToastProvider>{children}</ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
