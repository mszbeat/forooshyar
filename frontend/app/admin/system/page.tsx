'use client';

import { useState } from 'react';
import { adminApi } from '@/lib/admin';
import { SettingsPanel } from '@/components/admin/settings-panel';
import { Spinner, useToast } from '@/components/ui';
import { IconAlertCircle, IconInfo, IconRefresh, IconShield } from '@/components/icons';

export default function AdminSystemPage() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function restart() {
    if (!window.confirm('سرویس ری‌استارت می‌شود. روی Render خودکار بالا می‌آید؛ روی سرور دستی باید فرایند را بالا نگه دارید (pm2/systemd). ادامه؟')) return;
    setBusy(true);
    try {
      await adminApi.restart();
      toast.success('ری‌استارت شد', 'چند ثانیه بعد صفحه را دوباره باز کنید.');
    } catch (problem) {
      toast.error('انجام نشد', problem instanceof Error ? problem.message : 'خطای نامشخص');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <SettingsPanel group="system" />

      <div className="grid g-2" style={{ gap: 14 }}>
        <section className="card card-pad" style={{ display: 'grid', gap: 10, alignContent: 'start' }}>
          <div className="row" style={{ gap: 10 }}>
            <span className="stat-ico"><IconRefresh size={15} /></span>
            <div>
              <div className="card-title" style={{ margin: 0 }}>اعمال تغییرات اتصال</div>
              <div className="card-desc">CORS، کش و آدرس دیتابیس هنگام ساخت سرویس خوانده می‌شوند</div>
            </div>
          </div>
          <p className="small muted" style={{ lineHeight: 1.95 }}>
            بقیه‌ی تنظیمات (مدل، توکن، پرداخت) بلافاصله اثر می‌کنند. برای گروه بالا، سرویس باید یک‌بار
            ری‌استارت شود تا پیکربندی تازه خوانده شود.
          </p>
          <div className="row">
            <button type="button" className="btn btn-warn btn-sm" onClick={() => void restart()} disabled={busy}>
              {busy ? <Spinner size={14} /> : <IconRefresh size={14} />}
              ری‌استارت سرویس
            </button>
          </div>
        </section>

        <section className="card card-pad" style={{ display: 'grid', gap: 10, alignContent: 'start' }}>
          <div className="row" style={{ gap: 10 }}>
            <span className="stat-ico"><IconShield size={15} /></span>
            <div className="card-title" style={{ margin: 0 }}>چه چیزهایی از پنل قابل تغییر نیست؟</div>
          </div>
          <ul className="steps-plain">
            <li><span className="n num">۱</span><span><b>JWT_SECRET</b> — تغییرش همه‌ی نشست‌ها (فروشنده و ادمین) را باطل می‌کند؛ عمداً فقط از محیط سرور قابل تغییر است.</span></li>
            <li><span className="n num">۲</span><span><b>ADMIN_EMAIL / ADMIN_PASSWORD</b> — فقط برای ساخت اولیه‌ی حساب ادمین خوانده می‌شوند؛ بعد از آن رمز از صفحه‌ی «حساب ادمین» عوض می‌شود.</span></li>
            <li><span className="n num">۳</span><span><b>PORT / HOST</b> — پلتفرم مهمان‌دار آن‌هاست؛ تغییر از پنل یعنی سرویس دیده نشود.</span></li>
          </ul>
          <div className="adm-note">
            <IconAlertCircle size={16} />
            <span>هر تغییر تنظیمات در دفتر گردش با اکشن <b className="num">admin.settings_update</b> و ایمیل ادمین ثبت می‌شود؛ مقدار کلیدها هرگز در لاگ نوشته نمی‌شود.</span>
          </div>
        </section>
      </div>

      <div className="adm-note">
        <IconInfo size={16} />
        <span>
          نمونه‌ی بلوک متغیرهای محیطی برای Render — اگر ترجیح می‌دهید تنظیمات در محیط سرور بماند، همین‌ها را
          در تب Environment بگذارید و فیلدهای پنل را خالی رها کنید:
        </span>
      </div>
      <pre className="adm-code" dir="ltr">
        <span className="c"># Render → Environment</span>{'\n'}
        <span className="k">AI_ENABLED</span>=<span className="v">true</span>{'\n'}
        <span className="k">AI_API_KEY</span>=<span className="v">sk-...</span>{'\n'}
        <span className="k">AI_BASE_URL</span>=<span className="v">https://api.openai.com/v1</span>{'\n'}
        <span className="k">AI_MODEL</span>=<span className="v">gpt-4o-mini</span>{'\n'}
        <span className="k">CORS_ORIGINS</span>=<span className="v">https://panel.example.com</span>
      </pre>
    </>
  );
}
