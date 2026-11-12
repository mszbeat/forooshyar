'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, type CreditEntry, type CreditPack } from '@/lib/api';
import { SkeletonBlock, Spinner, useToast } from '@/components/ui';
import { IconCheckCircle } from '@/components/icons';

const REASON_LABELS: Record<string, string> = {
  ai_reply: 'پاسخ AI',
  pack_purchase: 'خرید بسته',
  admin_grant: 'هدیه‌ی ادمین',
};

/**
 * اعتبار پاسخ AI: مانده، بسته‌های قابل خرید و حرکت‌های اخیر.
 * پرداخت از درگاه پلتفرم انجام می‌شود؛ این بخش فقط نمایش و خرید است.
 */
export function CreditsSection() {
  const toast = useToast();
  const [balance, setBalance] = useState<number | null>(null);
  const [packs, setPacks] = useState<CreditPack[]>([]);
  const [recent, setRecent] = useState<CreditEntry[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [b, p, r] = await Promise.all([api.creditBalance(), api.creditPacks(), api.creditRecent()]);
      setBalance(b);
      setPacks(p);
      setRecent(r);
    } catch {
      toast.error('بارگذاری اعتبار ناموفق بود.');
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const buy = async (pack: CreditPack) => {
    setBusy(pack.slug);
    try {
      const result = await api.buyCreditPack(pack.slug);
      toast.success(`${pack.credits} اعتبار به حساب شما اضافه شد.`);
      setBalance(result.balance);
      await load();
    } catch (problem) {
      toast.error('خرید بسته ناموفق بود.', problem instanceof ApiError ? problem.message : undefined);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="card">
      <div className="card-head">
        <div className="row" style={{ gap: 10 }}>
          <span className="stat-ico"><IconCheckCircle size={15} /></span>
          <div>
            <div className="card-title">اعتبار پاسخ AI</div>
            <div className="card-desc">هر پاسخ خودکار AI یک واحد اعتبار مصرف می‌کند. با اتمام اعتبار، ربات به متن‌های آماده برمی‌گردد و هیچ پاسخی از دست نمی‌رود.</div>
          </div>
        </div>
        <span className="card-index num">۰۷</span>
      </div>

      {balance === null ? (
        <SkeletonBlock height={120} />
      ) : (
        <>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="text-sm text-zinc-500">مانده‌ی اعتبار</span>
            <span className="text-2xl font-bold tabular-nums">{balance.toLocaleString('fa-IR')}</span>
          </div>

          {packs.length > 0 && (
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginTop: 16 }}>
              {packs.map((pack) => (
                <div key={pack.slug} className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-700">
                  <div className="font-semibold">{pack.name}</div>
                  <div className="mt-1 text-sm text-zinc-500">{pack.credits.toLocaleString('fa-IR')} پاسخ AI</div>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="font-bold">{pack.price.toLocaleString('fa-IR')} تومان</span>
                    {pack.listPrice > pack.price && (
                      <span className="text-xs text-zinc-400 line-through">{pack.listPrice.toLocaleString('fa-IR')}</span>
                    )}
                  </div>
                  <button className="btn btn-primary btn-sm w-full" disabled={busy !== null} onClick={() => void buy(pack)} style={{ marginTop: 12 }}>
                    {busy === pack.slug ? <><Spinner size={14} /> در حال خرید…</> : 'خرید بسته'}
                  </button>
                </div>
              ))}
            </div>
          )}

          {recent.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <h4 className="text-sm font-semibold">حرکت‌های اخیر</h4>
              <ul className="mt-2 divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
                {recent.slice(0, 8).map((entry) => (
                  <li key={entry.id} className="flex items-center justify-between py-1.5">
                    <span className="text-zinc-600 dark:text-zinc-300">{REASON_LABELS[entry.reason] ?? entry.reason}</span>
                    <span className={`tabular-nums ${entry.delta >= 0 ? 'text-emerald-600' : 'text-zinc-500'}`}>
                      {entry.delta >= 0 ? '+' : ''}{entry.delta.toLocaleString('fa-IR')}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}
