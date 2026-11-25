import Link from "next/link";

type BarRow = { key: string; label: string; value: number; href?: string; sub?: string };

/** Horizontal magnitude bars with the value written beside each (one hue; the label carries identity). */
export function HBars({ rows, format = String }: { rows: BarRow[]; format?: (v: number) => string }) {
  const max = Math.max(...rows.map((r) => r.value), 0) || 1;
  return (
    <ul className="grid gap-2.5 text-sm">
      {rows.map((r) => (
        <li key={r.key} className="grid gap-1" data-testid={`bar-${r.key}`}>
          <div className="flex items-baseline justify-between gap-3">
            <span>
              {r.href ? <Link href={r.href} className="hover:underline">{r.label}</Link> : r.label}
              {r.sub && <span className="ml-2 text-xs text-muted-foreground">{r.sub}</span>}
            </span>
            <span className="font-medium tabular-nums">{format(r.value)}</span>
          </div>
          <div className="h-2 rounded-full bg-muted">
            {r.value > 0 && (
              <div className="h-2 rounded-full" style={{ width: `${Math.max(2, (r.value / max) * 100)}%`, background: "var(--viz-1)" }} />
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
