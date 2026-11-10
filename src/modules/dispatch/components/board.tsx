import { cn } from "cn";
import Link from "next/link";
import { formatInZone } from "@/lib/zoned-time";
import { type Span, packLanes, spanOnBoard } from "../board";
import { LOAD_STATUS_LABELS, type LoadStatus } from "../labels";
import { loadWindow } from "../overlap";
import type { BoardTruck, LoadListItem } from "../queries";

const BLOCK_STYLE: Record<LoadStatus, string> = {
  planned: "border-dashed border-foreground/40 bg-background",
  dispatched: "border-sky-600/40 bg-sky-50 dark:bg-sky-950/40",
  at_pickup: "border-amber-600/40 bg-amber-50 dark:bg-amber-950/40",
  in_transit: "border-indigo-600/40 bg-indigo-50 dark:bg-indigo-950/40",
  delivered: "border-emerald-700/30 bg-emerald-50 text-foreground/80 dark:bg-emerald-950/40",
  invoiced: "border-emerald-700/30 bg-emerald-50 dark:bg-emerald-950/40",
  paid: "border-emerald-700/30 bg-emerald-50 dark:bg-emerald-950/40",
  cancelled: "border-destructive/40 bg-destructive/10",
};

const TRUCK_STATUS: Record<string, string> = { in_shop: "In shop", out_of_service: "Out of service" };

type Props = { days: string[]; today: string; timeZone: string; trucks: BoardTruck[]; loads: LoadListItem[] };

function dayLabel(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const weekday = date.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
  return `${weekday} ${String(m).padStart(2, "0")}/${String(d).padStart(2, "0")}`;
}

function route(l: LoadListItem) {
  const first = l.stops[0];
  const last = l.stops.at(-1);
  return first && last ? `${first.city}, ${first.state} → ${last.city}, ${last.state}` : "";
}

export function DispatchBoard({ days, today, timeZone, trucks, loads }: Props) {
  const cols = `minmax(9rem, 11rem) repeat(${days.length}, minmax(7.5rem, 1fr))`;
  const byTruck = new Map<string, { load: LoadListItem; span: Span }[]>();
  for (const l of loads) {
    const w = loadWindow(l.stops);
    const span = w && spanOnBoard(w, days, timeZone);
    if (!span || !l.truck_id) continue;
    const list = byTruck.get(l.truck_id) ?? [];
    list.push({ load: l, span });
    byTruck.set(l.truck_id, list);
  }

  return (
    <div className="overflow-x-auto rounded-xl border">
      <div className="min-w-[60rem]">
        <div className="grid border-b bg-muted/40 text-xs font-medium" style={{ gridTemplateColumns: cols }}>
          <div className="px-3 py-2">Truck</div>
          {days.map((d) => (
            <div key={d} className={`border-l px-2 py-2 ${d === today ? "bg-primary/10 font-semibold" : ""}`}>
              {dayLabel(d)}{d === today ? " · Today" : ""}
            </div>
          ))}
        </div>
        {trucks.map((t) => {
          const items = byTruck.get(t.id) ?? [];
          const { lanes, laneCount } = packLanes(items.map((i) => i.span));
          const unavailable = TRUCK_STATUS[t.status];
          return (
            <div key={t.id} className={`grid border-b last:border-b-0 ${unavailable ? "bg-muted/50" : ""}`}
              style={{ gridTemplateColumns: cols, gridTemplateRows: `repeat(${laneCount}, minmax(3.25rem, auto))` }}
              data-testid={`board-truck-${t.unit_number}`}>
              <div className="px-3 py-2 text-sm" style={{ gridColumn: 1, gridRow: "1 / -1" }}>
                <Link href={`/trucks/${t.id}`} className="font-medium hover:underline">{t.unit_number}</Link>
                {unavailable && <span className="ml-1 text-xs text-destructive">{unavailable}</span>}
                <div className="truncate text-xs text-muted-foreground">{t.drivers.join(" & ") || "No driver"}</div>
              </div>
              {days.map((d, i) => (
                <div key={d} aria-hidden className={`border-l ${d === today ? "bg-primary/5" : ""}`}
                  style={{ gridColumn: i + 2, gridRow: "1 / -1" }} />
              ))}
              {items.map(({ load, span }, i) => (
                <Link
                  key={load.id}
                  href={`/loads/${load.id}`}
                  data-testid={`board-load-${load.load_number}`}
                  title={`${load.load_number} · ${LOAD_STATUS_LABELS[load.status]} · ${route(load)}${
                    load.stops[0]?.appointment_start ? ` · ${formatInZone(load.stops[0].appointment_start, load.stops[0].timezone)}` : ""
                  }`}
                  className={cn(
                    "z-10 m-1 min-w-0 overflow-hidden rounded-md border px-2 py-1 text-xs hover:ring-2 hover:ring-ring/50",
                    BLOCK_STYLE[load.status],
                    span.startsBefore && "ml-0 rounded-l-none border-l-0",
                    span.endsAfter && "mr-0 rounded-r-none border-r-0",
                  )}
                  style={{ gridColumn: `${span.firstCol + 2} / ${span.lastCol + 3}`, gridRow: lanes[i] + 1 }}
                >
                  <span className="font-semibold">{load.load_number}</span>
                  <span className="text-muted-foreground"> · {LOAD_STATUS_LABELS[load.status]}</span>
                  <div className="truncate">{route(load)}</div>
                </Link>
              ))}
            </div>
          );
        })}
        {trucks.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">No trucks yet.</p>}
      </div>
    </div>
  );
}
