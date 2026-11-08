'use client';

import { useState } from 'react';
import { adminApi } from '@/lib/admin';
import { SettingsPanel } from '@/components/admin/settings-panel';
import { ServiceCard } from '@/components/admin/probe';
import { IconInfo, IconSparkles } from '@/components/icons';

/**
 * انتخاب مدل.
 *
 * ارائه‌دهنده فقط دو فیلد را پر می‌کند (`AI_BASE_URL` و `AI_MODEL`)؛ هیچ مسیر
 * کد جدایی برای هر شرکت وجود ندارد. کارت‌ها همین دو مقدار را با هم ست می‌کنند
 * تا کاربر مجبور نباشد آدرس دقیق درگاه را از حفظ بداند.
 */
export default function AdminAiPage() {
  const [probeKey, setProbeKey] = useState(0);

  return (
    <>
      <SettingsPanel
        group="ai"
        renderExtra={({ payload, draft, set }) => {
          const currentBase = draft.AI_BASE_URL ?? '';
          const activeProvider = payload.providers.find(provider => provider.baseUrl === currentBase) ?? null;
          return (
            <section className="card card-pad" style={{ display: 'grid', gap: 14 }}>
              <div className="row" style={{ gap: 10 }}>
                <span className="stat-ico"><IconSparkles size={15} /></span>
                <div>
                  <div className="card-title" style={{ margin: 0 }}>انتخاب ارائه‌دهنده و مدل</div>
                  <div className="card-desc">با انتخاب هر گزینه، آدرس درگاه و نام مدل با هم پر می‌شوند.</div>
                </div>
              </div>

              <div className="adm-providers">
                {payload.providers.map(provider => (
                  <button
                    key={provider.id} type="button"
                    className={`adm-prov${activeProvider?.id === provider.id ? ' on' : ''}`}
                    onClick={() => {
                      set('AI_BASE_URL', provider.baseUrl);
                      set('AI_MODEL', provider.models[0]?.value ?? draft.AI_MODEL ?? '');
                    }}
                  >
                    {provider.label}
                  </button>
                ))}
                {!activeProvider && <span className="adm-tag">درگاه سفارشی: {currentBase || 'تنظیم نشده'}</span>}
              </div>

              {activeProvider && (
                <>
                  <div className="adm-models">
                    {activeProvider.models.map(model => (
                      <button
                        key={model.value} type="button"
                        className={`adm-model${draft.AI_MODEL === model.value ? ' on' : ''}`}
                        onClick={() => set('AI_MODEL', model.value)}
                      >
                        <span className="mname">{model.value}</span>
                        <span className="mhint">{model.label}</span>
                        {model.hint && <span className="adm-tag" style={{ marginInlineStart: 'auto' }}>{model.hint}</span>}
                      </button>
                    ))}
                  </div>
                  <div className="adm-note">
                    <IconInfo size={16} />
                    <span>
                      کلید این درگاه با پیشوند <b className="num">{activeProvider.keyHint}</b> است. اگر مدل روی سرور
                      خودتان است و کلید ندارد، در فیلد کلید مقدار <b className="num">local</b> بگذارید تا «وصل بودن» تشخیص داده شود.
                    </span>
                  </div>
                </>
              )}
            </section>
          );
        }}
      />

      <div key={probeKey} className="grid g-2" style={{ gap: 14, marginTop: 4 }}>
        <ServiceCard
          title="آزمون اتصال مدل"
          subtitle="یک درخواست واقعی به درگاه؛ کلید و مدل ذخیره‌شده استفاده می‌شود"
          icon={<IconSparkles size={15} />}
          status="PROBE"
          statusTone="warn"
          meta={[
            { label: 'نکته', value: 'بعد از ذخیره‌ی تنظیمات، این تست را بزنید' },
            { label: 'مسیر جایگزین', value: '/app/assistant' },
          ]}
          probeLabel="ارسال درخواست آزمایشی"
          onProbe={async () => {
            const probe = await adminApi.probeAi();
            setProbeKey(key => key + 1);
            return {
              tone: probe.ok ? 'ok' : 'bad',
              lines: [
                { label: 'مدل', value: probe.model },
                { label: 'درگاه', value: probe.provider },
                { label: 'زمان', value: `${probe.latencyMs}ms` },
                ...(probe.sample ? [{ label: 'پاسخ', value: probe.sample }] : []),
              ],
              error: probe.ok ? undefined : probe.error,
            };
          }}
        />
      </div>
    </>
  );
}
