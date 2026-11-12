'use client';

import { useEffect, useState } from 'react';
import { api, type ChannelConnection } from '@/lib/api';
import { PageHeader, SkeletonBlock } from '@/components/ui';
import { TelegramConnect } from '@/components/telegram-connect';
import { ChannelConnect } from '@/components/channel-connect';
import { InstagramConnect } from '@/components/instagram-connect';
import { IconBolt, IconCheckCircle, IconInstagram, IconSend } from '@/components/icons';

/**
 * اکانت‌ها — همه‌ی حساب‌های متصل فروشگاه در یک صفحه.
 *
 * اینستاگرام (BoxAPI OAuth)، تلگرام (بات)، بله و روبیکا (توکن بات).
 * هر کارت وضعیت اتصال خودش را نشان می‌دهد؛ خالی بودن یعنی هنوز هیچ
 * حسابی وصل نشده و مشتری فقط از کانال‌هایی که وصل‌اند می‌رسد.
 */
export default function AccountsPage() {
  const [channels, setChannels] = useState<ChannelConnection[] | null>(null);

  useEffect(() => {
    api.channels().then(setChannels).catch(() => setChannels([]));
  }, []);

  const hasAny = (channels?.length ?? 0) > 0;

  return (
    <div className="stack">
      <PageHeader
        eyebrow="اتصال"
        title="اکانت‌ها"
        description="حساب‌هایی که مشتری از طریق آن‌ها به فروشگاه شما می‌رسد. هر حساب جدا وصل و جدا قطع می‌شود."
      />

      {!hasAny && channels !== null && (
        <section className="card">
          <div className="card-head">
            <div className="row" style={{ gap: 10 }}>
              <span className="stat-ico"><IconCheckCircle size={15} /></span>
              <div>
                <div className="card-title">هنوز هیچ حسابی وصل نشده</div>
                <div className="card-desc">یکی از چهار پلتفرم را انتخاب کنید و وصل کنید؛ مشتری از همان‌جا سؤال می‌پرسد و سفارش می‌دهد.</div>
              </div>
            </div>
          </div>
          <div className="card-body">
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
              <a href="#instagram" className="platform-tile">
                <IconInstagram size={22} />
                <strong>اینستاگرام</strong>
                <span>دایرکت و کامنت</span>
              </a>
              <a href="#telegram" className="platform-tile">
                <IconSend size={22} />
                <strong>تلگرام</strong>
                <span>بات فروشگاه</span>
              </a>
              <a href="#messengers" className="platform-tile">
                <IconBolt size={22} />
                <strong>بله</strong>
                <span>بات پیام‌رسان</span>
              </a>
              <a href="#messengers" className="platform-tile">
                <IconBolt size={22} />
                <strong>روبیکا</strong>
                <span>بات پیام‌رسان</span>
              </a>
            </div>
          </div>
        </section>
      )}

      {channels === null && <SkeletonBlock height={120} />}

      <div id="instagram"><InstagramConnect /></div>
      <div id="telegram"><TelegramConnect /></div>
      <div id="messengers"><ChannelConnect /></div>
    </div>
  );
}
