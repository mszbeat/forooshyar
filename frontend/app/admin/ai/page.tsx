'use client';

import { useState } from 'react';
import { adminApi } from '@/lib/admin';
import { SettingsPanel } from '@/components/admin/settings-panel';
import { ModelRoute } from '@/components/admin/model-route';
import { ProbeResultPanel, ServiceCard, splitProviderError, type ProbeResult } from '@/components/admin/probe';
import { IconSparkles } from '@/components/icons';

/**
 * صفحه‌ی «مدل هوش مصنوعی».
 *
 * چیدمان عمدی است — دو نیمه، همیشه:
 * ┌───────────────────────────┬───────────────────────────┐
 * │ تنظیمات + مسیر مدل        │ آزمون اتصال ذخیره‌شده     │
 * ├───────────────────────────┴───────────────────────────┤
 * │ نتیجه‌ی آزمون (تمام‌عرض، فقط وقتی آزمونی اجرا شود)     │
 * └───────────────────────────────────────────────────────┘
 *
 * چرا نتیجه جدا از کارت است: قبلاً نتیجه داخل کارت خودش رندر می‌شد و کارت را
 * می‌کشید؛ در گرید دوستونی این کشیدگی، همسایه را هم جابه‌جا می‌کرد (باگ
 * گزارش‌شده). حالا نتیجه یک ردیف مستقل با `grid-column: 1 / -1` است: فقط
 * پایین صفحه را هُل می‌دهد و به اندازه‌ی کارت‌های بالا دست نمی‌زند.
 *
 * ترتیب محتوا: اول مسیر مدل (میزبان → مدل → آزمون)، بعد فیلدهای خام و آخر
 * آزمون سرویس. هر تغییری که ذخیره شود بدون ری‌استارت اثر می‌کند، چون
 * `AiService` مقدارها را در هر درخواست از env می‌خواند.
 */
export default function AdminAiPage() {
  const [result, setResult] = useState<ProbeResult | null>(null);

  return (
    <div className="ai-page">
      <div className="ai-page-split">
        <div className="ai-page-col ai-page-col-form">
          <SettingsPanel
            group="ai"
            renderExtra={({ payload, draft, set }) => (
              <ModelRoute providers={payload.providers} draft={draft} set={set} />
            )}
          />
        </div>

        <div className="ai-page-col ai-page-col-probe">
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
            onResult={setResult}
            onProbe={async () => {
              const probe = await adminApi.probeAi();
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
              } satisfies ProbeResult;
            }}
          />
        </div>

        {/* ردیف نتیجه: فقط وقتی آزمونی اجرا شده باشد. */}
        {result && (
          <div className="ai-page-result">
            <ProbeResultPanel result={result} title="نتیجه‌ی آزمون اتصال" />
          </div>
        )}
      </div>
    </div>
  );
}
