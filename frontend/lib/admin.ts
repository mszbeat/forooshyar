'use client';

import { API_BASE } from './api';

/**
 * کلاینت پنل ادمین.
 *
 * عمداً از `api` فروشنده جدا است و توکنش در کلید دیگری ذخیره می‌شود:
 * یک نفر می‌تواند هم‌زمان در یک تب پنل فروشنده و در تب دیگر پنل ادمین وارد
 * باشد، بدون اینکه ورود یکی، دیگری را بیرون بیندازد.
 */
const ADMIN_TOKEN_KEY = 'forooshyar.admin';

export const adminToken = {
  get(): string | null {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(ADMIN_TOKEN_KEY);
  },
  set(token: string) { window.localStorage.setItem(ADMIN_TOKEN_KEY, token); },
  clear() { window.localStorage.removeItem(ADMIN_TOKEN_KEY); },
};

export class AdminError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'AdminError';
    this.status = status;
  }
}

function describe(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const body = payload as Record<string, unknown>;
  const message = body.message ?? body.error;
  if (typeof message === 'string') return message;
  if (Array.isArray(message) && typeof message[0] === 'string') return message[0];
  return null;
}

async function call<T>(path: string, options: { method?: string; body?: unknown; auth?: boolean } = {}): Promise<T> {
  const { method = 'GET', body, auth = true } = options;
  const token = auth ? adminToken.get() : null;
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let payload: unknown = null;
  if (text) { try { payload = JSON.parse(text); } catch { payload = text; } }
  if (!response.ok) {
    if (response.status === 401 && auth && typeof window !== 'undefined') {
      adminToken.clear();
      if (!window.location.pathname.startsWith('/admin/login')) window.location.assign('/admin/login');
    }
    const messages: Record<number, string> = {
      400: 'مقادیر ارسالی معتبر نیست.',
      401: 'نشست ادمین منقضی شده است.',
      429: 'تعداد درخواست‌ها زیاد بود؛ کمی بعد تلاش کنید.',
      500: 'خطای غیرمنتظره در سرور.',
    };
    throw new AdminError(describe(payload) ?? messages[response.status] ?? `درخواست ناموفق (${response.status})`, response.status);
  }
  return payload as T;
}

export type AdminIdentity = { id: string; email: string; name: string; lastLoginAt: string | null; createdAt: string };
export type ManagedShop = { id: string; name: string; email: string; active: boolean; createdAt: string; products: number; orders: number };

export type SettingKind = 'bool' | 'text' | 'secret' | 'number' | 'url' | 'choice';

export type SettingView = {
  key: string;
  group: 'ai' | 'telegram' | 'payments' | 'database' | 'system';
  label: string;
  kind: SettingKind;
  hint: string | null;
  placeholder: string | null;
  optional: boolean;
  restart: boolean;
  choices: { value: string; label: string; hint?: string }[] | null;
  min: number | null;
  max: number | null;
  value: string;
  hasValue: boolean;
  source: 'db' | 'env' | 'default';
  updatedAt: string | null;
};

export type DatabaseLabel = { host: string; port: string; database: string; user: string; ssl: string; redacted: string };

export type SettingGroup = {
  id: SettingView['group'];
  label: string;
  description: string;
  database: DatabaseLabel | null;
  settings: SettingView[];
};

export type AiModel = { value: string; label: string; hint?: string; free?: boolean };
export type AiProvider = {
  id: string;
  label: string;
  baseUrl: string;
  keyHint: string;
  /** درگاه دستی: آدرسش را ادمین خودش می‌نویسد. */
  custom?: boolean;
  models: AiModel[];
};

export type SettingsPayload = { groups: SettingGroup[]; providers: AiProvider[]; restartRequired: string[] };

/** فهرست مدل‌های یک درگاه؛ `live` یعنی از خود ارائه‌دهنده آمده، نه از کاتالوگ. */
export type AiModelList = {
  provider: string;
  live: boolean;
  fetchedAt: string;
  models: AiModel[];
  error?: string;
};

export type Overview = {
  counts: {
    shops: number; users: number; products: number; variants: number;
    orders: number; messages: number; conversations: number; waiting: number;
  };
  ordersByStatus: { status: string; count: number }[];
  services: {
    ai: { enabled: boolean; ready: boolean; model: string; provider: string; reason: string };
    telegram: { configured: boolean; webhookSecretSet: boolean; publicUrl: string; baseUrl: string };
    payment: { provider: string };
    cache: { enabled: boolean };
    database: { latencyMs: number; version: string; size: string; tables: number; migrations: { name: string; at: string | null }[] } | null;
  };
  runtime: { uptimeSec: number; node: string; memoryMb: number; env: string };
  restartRequired: string[];
  /**
   * بخش‌هایی از این پاسخ که روی سرور خطا داده‌اند. نمای کلی حالا بخش‌به‌بخش
   * اجرا می‌شود؛ اگر یک پرس‌وجو بشکند بقیه می‌آید و دلیلش همین‌جا گزارش می‌شود.
   */
  problems?: { scope: string; message: string }[];
  recentShops: {
    id: string; name: string; owner: string; createdAt: string;
    products: number; orders: number; bot: string | null; ownerLinked: boolean;
  }[];
  recentAudit: {
    id: string; action: string; success: boolean; statusCode: number; durationMs: number;
    path: string; entity: string | null; entityId: string | null; at: string;
    meta: Record<string, unknown> | null;
  }[];
};

export type AiProbe = {
  ok: boolean; latencyMs: number; model: string; provider: string;
  sample?: string; error?: string; status?: number;
};
export type TelegramProbe = {
  ok: boolean; error: string | null;
  bot: { id: number; username: string | null } | null;
  webhook: { url: string; pending: number; lastError: string | null } | null;
};
export type DatabaseProbe =
  | { ok: true; latencyMs: number; version: string; products: number; shops: number }
  | { ok: false; latencyMs: number; error: string };

export const adminApi = {
  login: (email: string, password: string) =>
    call<{ accessToken: string; expiresIn: number; admin: AdminIdentity }>('/admin/auth/login', { method: 'POST', body: { email, password }, auth: false }),
  me: () => call<AdminIdentity>('/admin/auth/me'),
  changePassword: (current: string, next: string) =>
    call<{ ok: true }>('/admin/auth/password', { method: 'POST', body: { current, next } }),

  overview: () => call<Overview>('/admin/overview'),
  shops: () => call<ManagedShop[]>('/admin/shops'),
  createShop: (input: { name: string; email: string; password: string }) =>
    call<ManagedShop>('/admin/shops', { method: 'POST', body: input }),
  updateShop: (id: string, input: { name?: string; email?: string; password?: string; active?: boolean }) =>
    call<ManagedShop>(`/admin/shops/${encodeURIComponent(id)}`, { method: 'PATCH', body: input }),
  deleteShop: (id: string) =>
    call<{ ok: true }>(`/admin/shops/${encodeURIComponent(id)}`, { method: 'DELETE', body: { confirm: true } }),
  settings: () => call<SettingsPayload>('/admin/settings'),
  save: (values: Record<string, string>) =>
    call<{ saved: string[]; skipped: string[]; restartRequired: string[]; appliedLive?: string[] }>(
      '/admin/settings', { method: 'PUT', body: { values } },
    ),

  /**
   * آزمون مدل با مقادیر پیش‌نویس (ذخیره‌نشده).
   * سرور همان لحظه یک درخواست واقعی می‌فرستد؛ چیزی در دیتابیس نوشته نمی‌شود.
   */
  probeAi: (draft?: { baseUrl?: string; model?: string; apiKey?: string }) =>
    call<AiProbe>('/admin/diagnostics/ai', { method: 'POST', body: draft ?? {} }),
  /** فهرست مدل‌ها؛ با `refresh` کش سرور هم دور زده می‌شود. */
  aiModels: (input: { provider?: string; baseUrl?: string; apiKey?: string; refresh?: boolean }) => {
    const params = new URLSearchParams();
    if (input.provider) params.set('provider', input.provider);
    if (input.baseUrl) params.set('baseUrl', input.baseUrl);
    if (input.apiKey) params.set('apiKey', input.apiKey);
    if (input.refresh) params.set('refresh', '1');
    return call<AiModelList>(`/admin/ai/models?${params.toString()}`);
  },
  probeTelegram: () => call<TelegramProbe>('/admin/diagnostics/telegram', { method: 'POST', body: {} }),
  probeDatabase: (url?: string) => call<DatabaseProbe>('/admin/diagnostics/database', { method: 'POST', body: url ? { url } : {} }),
  database: () => call<{ latencyMs: number; version: string; size: string; tables: number; migrations: { name: string; at: string | null }[] }>('/admin/database'),

  restart: () => call<{ ok: true; restarting: true }>('/admin/restart', { method: 'POST', body: {} }),
};
