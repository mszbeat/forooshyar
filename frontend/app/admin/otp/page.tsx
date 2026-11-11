'use client';
import { SettingsPanel } from '@/components/admin/settings-panel';
export default function OtpAdminPage(){return <div className="stack"><SettingsPanel group="otp"/><div className="alert alert-warn">سرویس پیامک فعلاً Mock است و پیامک واقعی ارسال نمی‌کند. پس از تعیین ارائه‌دهنده، درگاه واقعی باید متصل شود.</div></div>}
