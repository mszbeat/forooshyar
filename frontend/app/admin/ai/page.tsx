'use client';

import { useState } from 'react';
import { adminApi } from '@/lib/admin';
import { SettingsPanel } from '@/components/admin/settings-panel';
import { ModelRoute } from '@/components/admin/model-route';
import { ServiceCard, splitProviderError } from '@/components/admin/probe';
import { IconSparkles } from '@/components/icons';

/**
 * صفحه‌ی «مدل هوش مصنوعی».
 *
 * ترتیب عمدی است: اول **مسیر مدل** (میزبان → مدل → آزمون)، بعد فیلدهای خام
 * (کلید، temperature، سقف توکن) و آخر آزمون کلی سرویس. هر تغییری که اینجا ذخیره
 * شود بدون ری‌استارت سرویس اثر می‌کند، چون `AiService` مقدارها را در لحظه‌ی
 * هر درخواست از env می‌خواند.
 */
export default function AdminAiPage() {
  const [probeKey, setProbeKey] = useState(0);

  return (
    <>
      <SettingsPanel
        group="ai"
        renderExtra={({ payload, draft, set }) => (
          <ModelRoute providers={payload.providers} draft={draft} set={set} />
        )}
      />

      <div key={probeKey} className="grid g-2" style={{ gap: 14, marginTop: 4 }}>
        <ServiceCard
          title="آزمون اتصال ذخیره‌شده"
          subtitle="همان کلید و مدلی که در سرور ذخیره شده است؛ برای مطمئن‌شدن از پاسخ واقعی بات"
          icon={<IconSparkles size={15} />}
          status="PROBE"
          statusTone="warn"
          meta={[
            { label: 'نکته', value: 'اول ذخیره، بعد این آزمون' },
            { label: 'مسیر جایگزین', value: '/app/assistant' },
          ]}
          probeLabel="ارسال درخواست آزمایشی"
          onProbe={async () => {
            const probe = await adminApi.probeAi();
            setProbeKey(key => key + 1);
            const split = probe.ok ? null : splitProviderError(probe.error ?? '');
            return {
              tone: probe.ok ? 'ok' : 'bad',
              lines: [
                { label: 'مدل', value: probe.model },
                { label: 'درگاه', value: probe.provider },
                { label: 'زمان', value: `${probe.latencyMs}ms` },
                ...(probe.sample ? [{ label: 'پاسخ', value: probe.sample }] : []),
              ],
              error: split?.headline,
              detail: split?.detail,
              statusText: split?.code,
            };
          }}
        />
      </div>
    </>
  );
}
