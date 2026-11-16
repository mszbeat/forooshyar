'use client';

import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/admin';
import { SettingsPanel } from '@/components/admin/settings-panel';
import { IconCopy, IconInfo } from '@/components/icons';
import { useToast } from '@/components/ui';

/**
 * پیام‌رسان‌های ایرانی (فقط ادمین) — بات مشترک بله و روبیکا.
 *
 * توکن و سکرت webhook این دو بات فقط همین‌جا (یا env سرور) تنظیم می‌شوند؛
 * فروشنده‌ها توکن خودشان را وارد نمی‌کنند و فقط اتصال را فعال می‌کنند.
 * آدرس webhook شامل سکرت است، پس سکرت هرگز در این صفحه نمایش داده نمی‌شود؛
 * فقط مسیر پایه (بدون سکرت) برای کپی نشان داده می‌شود.
 */
export default function AdminMessengersPage() {
  const toast = useToast();
  const [apiBase, setApiBase] = useState('');

  useEffect(() => {
    adminApi.overview().then(overview => {
      setApiBase((overview.services.telegram.publicUrl ?? '').replace(/\/+$/, ''));
    }).catch(() => setApiBase(''));
  }, []);

  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); toast.success('کپی شد', 'آدرس در حافظه کپی شد.'); }
    catch { toast.error('کپی نشد', 'دسترسی به حافظه ندارید.'); }
  };

  const webhookUrl = (platform: 'bale' | 'rubika') =>
    apiBase ? `${apiBase}/${platform}/webhook/<secret>` : `/${platform}/webhook/<secret>`;
  const rubikaInlineUrl = () => apiBase ? `${apiBase}/rubika/inline-webhook/<secret>` : '/rubika/inline-webhook/<secret>';

  return (
    <>
      <SettingsPanel group="messengers" />

      <div className="grid g-2" style={{ gap: 14 }}>
        <section className="card card-pad" style={{ display: 'grid', gap: 10, alignContent: 'start' }}>
          <div className="card-title" style={{ margin: 0 }}>آدرس webhook</div>
          <p className="small muted" style={{ margin: 0, lineHeight: 1.9 }}>
            بخش <code dir="ltr">&lt;secret&gt;</code> همان سکرتی است که در تنظیمات بالا ذخیره کرده‌اید؛
            سکرت در این صفحه نمایش داده نمی‌شود. پس از ذخیره‌ی توکن یا سکرت، سرور تلاش می‌کند webhook را خودکار روی بات تازه ثبت کند؛ اگر خطای ثبت دیدید، همین آدرس را طبق روش پایین در پنل پلتفرم ثبت کنید.
          </p>
          {(['bale', 'rubika'] as const).map(platform => (
            <div key={platform}>
              <div className="kv-k">{platform === 'bale' ? 'بله — دریافت پیام و کلیک‌ها' : 'روبیکا — دریافت پیام‌ها'}</div>
              <code dir="ltr" style={{ display: 'block', padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 10, fontSize: 12.5, overflowWrap: 'anywhere', wordBreak: 'break-all', textAlign: 'left' }}>
                {webhookUrl(platform)}
              </code>
              <button type="button" className="btn btn-outline btn-sm" style={{ marginTop: 8 }} onClick={() => void copy(webhookUrl(platform))}>
                <IconCopy size={14} /> کپی آدرس
              </button>
              {platform === 'rubika' && <>
                <div className="kv-k" style={{ marginTop: 12 }}>روبیکا — کلیک روی دکمه‌های شیشه‌ای (ReceiveInlineMessage)</div>
                <code dir="ltr" style={{ display: 'block', padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 10, fontSize: 12.5, overflowWrap: 'anywhere', wordBreak: 'break-all', textAlign: 'left' }}>{rubikaInlineUrl()}</code>
                <button type="button" className="btn btn-outline btn-sm" style={{ marginTop: 8 }} onClick={() => void copy(rubikaInlineUrl())}>
                  <IconCopy size={14} /> کپی آدرس کلیک‌ها
                </button>
              </>}
            </div>
          ))}
        </section>

        <section className="card card-pad" style={{ display: 'grid', gap: 10, alignContent: 'start' }}>
          <div className="row" style={{ gap: 10 }}>
            <span className="stat-ico"><IconInfo size={15} /></span>
            <div className="card-title" style={{ margin: 0 }}>ترتیب راه‌اندازی</div>
          </div>
          <ol className="steps-plain">
            <li><span className="n num">۱</span><span>بات بله را از <b dir="ltr">@BotFather</b> و بات روبیکا را از بخش بات‌های روبیکا بسازید.</span></li>
            <li><span className="n num">۲</span><span>توکن هر بات و یک سکرت webhook (حداقل ۱۶ کاراکتر) را در تنظیمات بالا ذخیره کنید.</span></li>
            <li><span className="n num">۳</span><span>با ذخیره‌ی توکن و سکرت، فروش‌یار به‌صورت خودکار webhook بله و هر دو endpoint روبیکا (پیام و کلیک دکمه) را ثبت می‌کند. اگر سرور نشانی HTTPS عمومی نداشته باشد یا ثبت ناموفق شود، خطا را نشان می‌دهد و می‌توانید آدرس‌های بالای صفحه را دستی ثبت کنید.</span></li>
            <li><span className="n num">۴</span><span>فروشنده در پنل خودش ← اکانت‌ها، اتصال بله/روبیکا را فعال می‌کند؛ توکنی از او گرفته نمی‌شود.</span></li>
            <li><span className="n num">۵</span><span>مشتری از لینک فروشگاه وارد بات می‌شود؛ انتخاب‌های کاتالوگ و سفارش را با دکمه‌های قابل‌کلیک انجام می‌دهد و مراحل بعدی همان فلو سفارش تلگرام است.</span></li>
          </ol>
          <div className="adm-note">
            <IconInfo size={16} />
            <span>
              بات مشترک است: یک توکن برای همه‌ی فروشگاه‌ها. مسیریابی به فروشگاه با کد لینک
              (<code dir="ltr">/start &lt;code&gt;</code>) انجام می‌شود، مثل تلگرام.
            </span>
          </div>
        </section>
      </div>
    </>
  );
}
