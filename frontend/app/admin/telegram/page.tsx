'use client';

import { adminApi } from '@/lib/admin';
import { SettingsPanel } from '@/components/admin/settings-panel';
import { ServiceCard } from '@/components/admin/probe';
import { IconBolt, IconInfo } from '@/components/icons';

export default function AdminTelegramPage() {
  return (
    <>
      <SettingsPanel group="telegram" />
      <div className="grid g-2" style={{ gap: 14 }}>
        <ServiceCard
          title="آزمون ربات"
          subtitle="getMe و getWebhookInfo مستقیم از سرور تلگرام"
          icon={<IconBolt size={15} />}
          status="PROBE"
          statusTone="warn"
          meta={[
            { label: 'هویت بات', value: 'نام کاربری و شناسه' },
            { label: 'webhook', value: 'آدرس ثبت‌شده و صف آپدیت‌ها' },
          ]}
          onProbe={async () => {
            const probe = await adminApi.probeTelegram();
            return {
              tone: probe.ok ? 'ok' : 'bad',
              lines: [
                { label: 'بات', value: probe.bot ? `@${probe.bot.username ?? ''} (${probe.bot.id})` : '—' },
                { label: 'webhook', value: probe.webhook?.url || 'ثبت نشده' },
                { label: 'در صف', value: String(probe.webhook?.pending ?? 0) },
                { label: 'آخرین خطا', value: probe.webhook?.lastError ?? '—' },
              ],
              error: probe.error ?? undefined,
            };
          }}
        />

        <section className="card card-pad" style={{ display: 'grid', gap: 10, alignContent: 'start' }}>
          <div className="row" style={{ gap: 10 }}>
            <span className="stat-ico"><IconInfo size={15} /></span>
            <div className="card-title" style={{ margin: 0 }}>ترتیب درست تغییر توکن</div>
          </div>
          <ol className="steps-plain">
            <li><span className="n num">۱</span><span>توکن تازه را از BotFather بگیرید و همین‌جا ذخیره کنید.</span></li>
            <li><span className="n num">۲</span><span>سکرت webhook را هم عوض کنید (حداقل ۱۶ کاراکتر) تا مسیر قدیمی بی‌اعتبار شود.</span></li>
            <li><span className="n num">۳</span><span>در پنل فروشنده → تنظیمات → تلگرام، دکمه‌ی «ثبت webhook» را بزنید.</span></li>
            <li><span className="n num">۴</span><span>همین صفحه را «آزمون ربات» بزنید تا آدرس و صف آپدیت‌ها دیده شود.</span></li>
          </ol>
          <div className="adm-note">
            <IconInfo size={16} />
            <span>
              سرور باید به <b className="num">api.telegram.org</b> دسترسی داشته باشد. اگر سرور پشت تحریم است،
              آدرس Bot API را به یک درگاه واسط سازگار تغییر دهید — بقیه‌ی کد تغییری لازم ندارد.
            </span>
          </div>
        </section>
      </div>
    </>
  );
}
