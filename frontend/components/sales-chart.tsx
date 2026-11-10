'use client';

import { useRef, useState } from 'react';
import type { Summary } from '@/lib/api';
import { faNum, faWeekday, tomanShort } from '@/lib/format';

type Metric = 'revenue' | 'units';

export function SalesChart({ series, metric }: { series: Summary['sales']['series']; metric: Metric }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showPoint = (index: number) => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setHovered(index), 120);
  };
  const hidePoint = () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setHovered(null), 220);
  };
  const W = 760, H = 270, left = 58, right = 14, top = 18, bottom = 42;
  const innerW = W - left - right, innerH = H - top - bottom;
  const values = series.map(point => metric === 'revenue' ? point.revenue : point.units);
  const max = Math.max(1, ...values);
  const points = series.map((point, index) => ({
    x: series.length < 2 ? W / 2 : left + (index / (series.length - 1)) * innerW,
    y: top + innerH - ((values[index] ?? 0) / max) * innerH,
    point,
    value: values[index] ?? 0,
  }));
  const line = points.length
    ? points.reduce((path, point, i) => {
        if (i === 0) return `M ${point.x} ${point.y}`;
        const prev = points[i - 1];
        const dx = (point.x - prev.x) / 3;
        return `${path} C ${prev.x + dx} ${prev.y}, ${point.x - dx} ${point.y}, ${point.x} ${point.y}`;
      }, '')
    : '';
  const baseline = top + innerH;
  const area = points.length ? `${line} L ${points.at(-1)!.x} ${baseline} L ${points[0].x} ${baseline} Z` : '';
  const tickLabel = (ratio: number) => metric === 'revenue'
    ? tomanShort(Math.round(max * ratio))
    : faNum(Math.round(max * ratio));

  return (
    <div className="sales-chart" role="group" aria-label={metric === 'revenue' ? 'نمودار تعاملی درآمد فروش روزانه' : 'نمودار تعاملی تعداد فروش روزانه'}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id="sales-area" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-blue)" stopOpacity=".34" />
            <stop offset="88%" stopColor="var(--chart-blue)" stopOpacity=".015" />
          </linearGradient>
          <linearGradient id="sales-line" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="var(--chart-blue)" />
            <stop offset="100%" stopColor="var(--chart-teal)" />
          </linearGradient>
          <filter id="sales-glow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        {[0, .25, .5, .75, 1].map(ratio => {
          const y = top + innerH * (1 - ratio);
          return <g key={ratio}>
            <line x1={left} x2={W - right} y1={y} y2={y} className="sales-gridline" />
            <text x={left - 10} y={y + 4} textAnchor="end" className="sales-axis-label">{tickLabel(ratio)}</text>
          </g>;
        })}
        {area && <path d={area} fill="url(#sales-area)" />}
        {line && <path d={line} fill="none" stroke="url(#sales-line)" strokeWidth="3" strokeLinecap="round" filter="url(#sales-glow)" />}
        {points.map(({ x, y, point, value }, index) => (
          <g key={point.date}>
            <title>{`${faWeekday(point.date)} · ${metric === 'revenue' ? tomanShort(point.revenue) + ' تومان' : faNum(point.units) + ' قلم'} · ${faNum(point.units)} قلم`}</title>
            <circle cx={x} cy={y} r="16" fill="transparent" className="sales-hover-target" tabIndex={0} role="button"
              aria-label={`${faWeekday(point.date)}: ${metric === 'revenue' ? tomanShort(point.revenue) + ' تومان' : faNum(point.units) + ' قلم'}, ${faNum(point.units)} قلم`}
              onPointerEnter={() => showPoint(index)} onPointerLeave={hidePoint}
              onFocus={() => showPoint(index)} onBlur={hidePoint} />
            <circle cx={x} cy={y} r={hovered === index ? 8 : 7} className="sales-point-halo" />
            <circle cx={x} cy={y} r={hovered === index ? 4.5 : 3.5} className="sales-point" />
            <text x={x} y={H - 13} textAnchor="middle" className="sales-axis-label sales-x-label">{faWeekday(point.date)}</text>
          </g>
        ))}
      </svg>
      {hovered !== null && points[hovered] && (
        <div className="sales-chart-tooltip" style={{ left: `${Math.min(88, Math.max(12, (points[hovered].x / W) * 100))}%`, top: `${Math.max(25, (points[hovered].y / H) * 100)}%` }} aria-live="polite">
          <b>{faWeekday(points[hovered].point.date)}</b>
          <span>{metric === 'revenue' ? `${tomanShort(points[hovered].point.revenue)} تومان` : `${faNum(points[hovered].point.units)} قلم`}</span>
          <small>{faNum(points[hovered].point.units)} قلم فروش</small>
        </div>
      )}
      <div className="sales-chart-legend"><i /> {metric === 'revenue' ? 'درآمد فروش' : 'تعداد اقلام فروخته‌شده'} <span>{metric === 'revenue' ? 'تومان' : 'قلم'}</span></div>
    </div>
  );
}
