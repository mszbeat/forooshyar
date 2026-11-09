'use client';

import { useEffect, useRef, useState } from 'react';
import { API_BASE, tokenStore } from './api';
import { adminToken } from './admin';

/**
 * جریان رخدادهای زندهٔ پنل (Server-Sent Events).
 *
 * چرا SSE و نه WebSocket: مرورگر فقط به یک origin حرف می‌زند و `/api/*` در Next
 * به API پروکسی می‌شود. ارتقای WebSocket از میان همان پروکسی و روی Render،
 * تنظیمات و نگهداری جدا می‌خواهد؛ SSE روی همان HTTP معمولی سوار می‌شود، در
 * مرورگر خودش دوباره وصل می‌شود و برای جریان یک‌طرفهٔ «سرور → پنل» کافی است.
 *
 * نکتهٔ مهم (محدودیت EventSource): هدر Authorization نمی‌شود فرستاد، پس توکن
 * به‌صورت query می‌رود و سرور همان را می‌خواند. توکن فقط روی همان origin و در
 * مسیر محافظت‌شده دیده می‌شود و در Referer به بیرون نمی‌رود (`referrerPolicy`).
 */

export type RealtimeEvent = {
  type: string;
  at: string;
  data?: Record<string, unknown>;
};

type Options = {
  /** هر رخدادی که رسید. با `type` می‌توانید فیلتر کنید. */
  onEvent?: (event: RealtimeEvent) => void;
  /** اگر false شود، اتصال بسته می‌ماند (مثلاً صفحه‌ای که به آن نیاز ندارد). */
  enabled?: boolean;
};

const GLOBAL_KEY = 'forooshyar.realtime.generation';

/**
 * شمارندهٔ نسل سراسری.
 *
 * چرا: چند صفحه/چند کامپوننت می‌توانند هم‌زمان به رخدادها گوش بدهند. با یک
 * شمارندهٔ ماژول‌سطح، هر رخداد یک بار «اعلام» می‌شود و همهٔ شنونده‌ها با هم
 * به‌روز می‌شوند — بدون اینکه هر کامپوننت اتصال جدا باز کند.
 */
const listeners = new Set<(event: RealtimeEvent) => void>();
let generation = 0;

function bump(): void {
  generation += 1;
  if (typeof window !== 'undefined') window.localStorage.setItem(GLOBAL_KEY, String(generation));
}

/** نسل فعلی رخدادها؛ صفحه‌ها با تغییرش می‌فهمند «چیزی عوض شد». */
export function useRealtimeSignal(): number {
  const [signal, setSignal] = useState(0);
  useEffect(() => {
    const bumpLocal = () => setSignal(value => value + 1);
    listeners.add(bumpLocal);
    return () => {
      listeners.delete(bumpLocal);
    };
  }, []);
  return signal;
}

let shared: EventSource | null = null;
let sharedRefs = 0;

function attach(onEvent: (event: RealtimeEvent) => void): () => void {
  const sink = (event: RealtimeEvent) => {
    onEvent(event);
    for (const listener of listeners) listener(event);
  };
  handlers.add(sink);
  sharedRefs += 1;

  if (!shared && typeof window !== 'undefined') {
    const token = tokenStore.get();
    if (token) {
      const url = `${API_BASE}/events?token=${encodeURIComponent(token)}`;
      const source = new EventSource(url, { withCredentials: false });
      source.onmessage = message => {
        try {
          const event = JSON.parse(message.data) as RealtimeEvent;
          if (event.type === 'ping') return;
          for (const handler of handlers) handler(event);
        } catch {
          /* پیام ناقص؛ نادیده */
        }
      };
      source.onerror = () => {
        // EventSource خودش دوباره وصل می‌شود؛ فقط اگر ۴۰۱ بود و توکن باطل شد،
        // اتصال را می‌بندیم تا صفحه در حلقهٔ درخواست نیفتد.
        if (source.readyState === EventSource.CLOSED) shared = null;
      };
      shared = source;
    }
  }

  return () => {
    handlers.delete(sink);
    sharedRefs -= 1;
    if (sharedRefs <= 0 && shared) {
      shared.close();
      shared = null;
      sharedRefs = 0;
    }
  };
}

const handlers = new Set<(event: RealtimeEvent) => void>();

/** اتصال سراسری را ببندید (مثلاً هنگام خروج از حساب). */
export function closeRealtime(): void {
  if (shared) shared.close();
  shared = null;
  sharedRefs = 0;
  handlers.clear();
}

/**
 * هوک رخدادها.
 * @param types اگر بدهید، فقط همان نوع‌ها به `onEvent` می‌رسند.
 */
export function useRealtime(types: string[] | null, onEvent: (event: RealtimeEvent) => void, options: Options = {}): void {
  const handler = useRef(onEvent);
  handler.current = onEvent;
  const keys = types ? types.join('|') : '';
  const enabled = options.enabled ?? true;

  useEffect(() => {
    if (!enabled) return;
    const allow = keys ? new Set(keys.split('|')) : null;
    const detach = attach(event => {
      if (!allow || allow.has(event.type)) handler.current(event);
    });
    bump();
    return detach;
  }, [keys, enabled]);
}

/**
 * جریان رخدادهای اتاق کنترل ادمین.
 *
 * همان قرارداد SSE، ولی با توکن ادمین و مسیر `/admin/events`. عمداً از جریان
 * فروشنده جدا است: توکن ادمین `shopId` ندارد و نباید داده‌ی یک فروشگاه را ببیند.
 */
let adminShared: EventSource | null = null;
let adminRefs = 0;
const adminHandlers = new Set<(event: RealtimeEvent) => void>();

function attachAdmin(onEvent: (event: RealtimeEvent) => void): () => void {
  adminHandlers.add(onEvent);
  adminRefs += 1;

  if (!adminShared && typeof window !== 'undefined') {
    const token = adminToken.get();
    if (token) {
      const source = new EventSource(`${API_BASE}/admin/events?token=${encodeURIComponent(token)}`);
      source.onmessage = message => {
        try {
          const event = JSON.parse(message.data) as RealtimeEvent;
          if (event.type === 'ping') return;
          for (const handler of adminHandlers) handler(event);
        } catch {
          /* پیام ناقص؛ نادیده */
        }
      };
      source.onerror = () => { if (source.readyState === EventSource.CLOSED) adminShared = null; };
      adminShared = source;
    }
  }

  return () => {
    adminHandlers.delete(onEvent);
    adminRefs -= 1;
    if (adminRefs <= 0 && adminShared) {
      adminShared.close();
      adminShared = null;
      adminRefs = 0;
    }
  };
}

/** هوک رخدادهای ادمین؛ مثل نسخهٔ فروشنده ولی روی جریان اتاق کنترل. */
export function useAdminRealtime(types: string[] | null, onEvent: (event: RealtimeEvent) => void, enabled = true): void {
  const handler = useRef(onEvent);
  handler.current = onEvent;
  const keys = types ? types.join('|') : '';

  useEffect(() => {
    if (!enabled) return;
    const allow = keys ? new Set(keys.split('|')) : null;
    const detach = attachAdmin(event => {
      if (!allow || allow.has(event.type)) handler.current(event);
    });
    return detach;
  }, [keys, enabled]);
}

/** بستن جریان ادمین (هنگام خروج). */
export function closeAdminRealtime(): void {
  if (adminShared) adminShared.close();
  adminShared = null;
  adminRefs = 0;
  adminHandlers.clear();
}
