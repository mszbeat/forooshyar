'use client';

import { useRef, useState } from 'react';
import { faNum } from '@/lib/format';

export function InventoryDonut({ total, low, out }: { total: number; low: number; out: number }) {
  const [hovered, setHovered] = useState<'healthy' | 'low' | 'out' | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleHover = (value: 'healthy' | 'low' | 'out' | null) => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setHovered(value), value ? 140 : 220);
  };
  const safeTotal = Math.max(0, total);
  const safeOut = Math.min(safeTotal, Math.max(0, out));
  const safeLow = Math.min(safeTotal - safeOut, Math.max(0, low));
  const healthy = Math.max(0, safeTotal - safeLow - safeOut);
  const radius = 34, circumference = 2 * Math.PI * radius;
  const portions = [healthy, safeLow, safeOut];
  let offset = 0;
  const arcs = portions.map((value, index) => {
    const length = safeTotal ? (value / safeTotal) * circumference : 0;
    const arc = { value, length, offset, cls: ['healthy', 'low', 'out'][index] };
    offset += length;
    return arc;
  });
  return (
    <div className="inventory-health" aria-label={`وضعیت موجودی: ${faNum(healthy)} سالم، ${faNum(safeLow)} کم، ${faNum(safeOut)} ناموجود`}>
      <div className="inventory-health-head">
        <span>سلامت موجودی</span><span className="inventory-health-period">واریانت‌ها</span>
      </div>
      <div className="inventory-health-body">
        <div className="inventory-ring" role="img" aria-label={`${faNum(safeTotal)} واریانت`}>
          <svg viewBox="0 0 88 88" aria-hidden="true">
            <circle cx="44" cy="44" r={radius} className="inventory-ring-track" />
            {arcs.map(arc => arc.length > 0 && (
              <circle key={arc.cls} cx="44" cy="44" r={radius} className={`inventory-ring-arc ${arc.cls}${hovered === arc.cls ? ' is-hovered' : ''}`}
                strokeDasharray={`${arc.length} ${circumference - arc.length}`} strokeDashoffset={-arc.offset}
                onPointerEnter={() => scheduleHover(arc.cls as 'healthy' | 'low' | 'out')} onPointerLeave={() => scheduleHover(null)}>
                <title>{`${arc.cls === 'healthy' ? 'موجودی مناسب' : arc.cls === 'low' ? 'موجودی کم' : 'ناموجود'}: ${faNum(arc.value)} واریانت`}</title>
              </circle>
            ))}
          </svg>
          <span><b>{safeTotal ? faNum(safeTotal) : '—'}</b><small>واریانت</small></span>
        </div>
        <div className="inventory-legend">
          <div onPointerEnter={() => scheduleHover('healthy')} onPointerLeave={() => scheduleHover(null)}><i className="healthy"/><span>موجودی مناسب</span><b>{faNum(healthy)}</b></div>
          <div onPointerEnter={() => scheduleHover('low')} onPointerLeave={() => scheduleHover(null)}><i className="low"/><span>موجودی کم</span><b>{faNum(safeLow)}</b></div>
          <div onPointerEnter={() => scheduleHover('out')} onPointerLeave={() => scheduleHover(null)}><i className="out"/><span>ناموجود</span><b>{faNum(safeOut)}</b></div>
        </div>
      </div>
      <div className={`inventory-hover-tip${hovered ? ' active' : ''}`} aria-live="polite" aria-hidden={!hovered}>
        {hovered ? <><span>{hovered === 'healthy' ? 'موجودی مناسب' : hovered === 'low' ? 'موجودی کم' : 'ناموجود'}</span><b>{faNum(hovered === 'healthy' ? healthy : hovered === 'low' ? safeLow : safeOut)} <small>واریانت</small></b></> : <span className="inventory-tip-hint">برای دیدن جزئیات، روی نمودار یا برچسب‌ها مکث کنید</span>}
      </div>
    </div>
  );
}
