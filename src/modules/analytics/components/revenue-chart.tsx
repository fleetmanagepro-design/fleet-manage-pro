"use client";

import { useState } from "react";
import { formatCents } from "@/lib/money";
import { niceScale } from "../calculations";

type Point = { key: string; label: string; revenueCents: number; loads: number };

const W = 720;
const H = 240;
const PAD = { top: 12, right: 8, bottom: 26, left: 56 };

function short(cents: number): string {
  const d = cents / 100;
  if (d >= 1_000_000) return `$${(d / 1_000_000).toFixed(d % 1_000_000 ? 1 : 0)}M`;
  if (d >= 1000) return `$${Math.round(d / 1000)}k`;
  return `$${Math.round(d)}`;
}

/** Revenue per day / week / month as bars, with a hover tooltip and a table view. One series: no legend. */
export function RevenueChart({ points }: { points: Point[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const { top, step } = niceScale(Math.max(...points.map((p) => p.revenueCents), 0));
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const base = PAD.top + plotH;
  const slot = plotW / Math.max(points.length, 1);
  const barW = Math.max(2, Math.min(36, slot - 2)); // keeps at least a 2px surface gap between bars
  const y = (v: number) => base - (v / top) * plotH;
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const labelEvery = Math.ceil(points.length / 12);
  const h = hover !== null ? points[hover] : null;

  return (
    <div className="grid gap-2">
      <div className="relative" onMouseLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Revenue, ${points.length} bars`}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--viz-grid)" strokeWidth={1} />
              <text x={PAD.left - 8} y={y(t)} textAnchor="end" dominantBaseline="middle"
                className="fill-muted-foreground text-[11px] tabular-nums">
                {short(t)}
              </text>
            </g>
          ))}
          {points.map((p, i) => {
            const x = PAD.left + i * slot + (slot - barW) / 2;
            const yTop = y(p.revenueCents);
            const bh = base - yTop;
            const r = Math.min(4, barW / 2, bh);
            const d = `M${x},${base} V${yTop + r} Q${x},${yTop} ${x + r},${yTop} H${x + barW - r} Q${x + barW},${yTop} ${x + barW},${yTop + r} V${base} Z`;
            return (
              <g key={p.key}>
                {bh > 0 && <path d={d} fill="var(--viz-1)" opacity={hover === null || hover === i ? 1 : 0.45} />}
                {i % labelEvery === 0 && (
                  <text x={x + barW / 2} y={H - 8} textAnchor="middle" className="fill-muted-foreground text-[11px]">{p.label}</text>
                )}
                {/* hit target: the whole column, larger than the bar */}
                <rect x={PAD.left + i * slot} y={PAD.top} width={slot} height={plotH} fill="transparent"
                  onMouseEnter={() => setHover(i)} />
              </g>
            );
          })}
          <line x1={PAD.left} x2={W - PAD.right} y1={base} y2={base} stroke="currentColor" className="text-border" />
        </svg>
        {h && hover !== null && (
          <div role="status" className="pointer-events-none absolute top-1 rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-md"
            style={{ left: `${((PAD.left + (hover + 0.5) * slot) / W) * 100}%`, transform: "translateX(-50%)" }}>
            <div className="font-medium">{h.label}</div>
            <div className="tabular-nums">{formatCents(h.revenueCents)}</div>
            <div className="text-muted-foreground">{h.loads} {h.loads === 1 ? "load" : "loads"} delivered</div>
          </div>
        )}
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer text-xs text-muted-foreground">Show as table</summary>
        <table className="mt-2 w-full tabular-nums">
          <thead className="text-left text-xs text-muted-foreground">
            <tr>
              <th className="py-1 font-normal">Period</th>
              <th className="py-1 text-right font-normal">Loads</th>
              <th className="py-1 text-right font-normal">Revenue</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.key} className="border-t">
                <td className="py-1">{p.label}</td>
                <td className="py-1 text-right">{p.loads}</td>
                <td className="py-1 text-right">{formatCents(p.revenueCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
