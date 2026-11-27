import { StatusPill } from "@/components/status-pill";
import { formatCalendarDate } from "@/lib/dates";
import { type ExpiryItem, type ExpiryState, worstState } from "@/lib/expiry";

/** One badge summarising the most urgent expiration, for list rows. */
export function ComplianceSummary({ items }: { items: ExpiryItem[] }) {
  const state = worstState(items);
  const urgent = items.filter((i) => i.state === state);
  const text = urgent.map((i) => i.label).join(", ");
  if (state === "ok") return <span className="text-xs text-muted-foreground">OK</span>;
  if (state === "upcoming") {
    return <span title={text}><StatusPill tone="neutral">Upcoming: {text}</StatusPill></span>;
  }
  if (state === "missing") return <span className="text-xs text-muted-foreground">No dates</span>;
  return (
    <span title={text}>
      <StatusPill tone={state === "expired" ? "red" : "amber"}>{state === "expired" ? "Expired" : "Due soon"}: {text}</StatusPill>
    </span>
  );
}

const STATE_TEXT: Record<ExpiryState, (i: ExpiryItem) => string> = {
  expired: (i) => `Expired ${Math.abs(i.daysLeft ?? 0)} day${Math.abs(i.daysLeft ?? 0) === 1 ? "" : "s"} ago`,
  due_soon: (i) => (i.daysLeft === 0 ? "Expires today" : `Due in ${i.daysLeft} day${i.daysLeft === 1 ? "" : "s"}`),
  upcoming: (i) => `Due in ${i.daysLeft} days`,
  ok: () => "OK",
  missing: () => "Not entered",
};

export function ComplianceList({ items }: { items: ExpiryItem[] }) {
  return (
    <ul className="grid gap-2">
      {items.map((i) => (
        <li key={i.key} className="flex items-center justify-between gap-4 text-sm" data-testid={`compliance-${i.key}`}>
          <span>
            {i.label}
            {i.key === "annual_inspection" ? " due" : ""}: {formatCalendarDate(i.dueOn)}
            {i.note && <span className="ml-1 text-muted-foreground">({i.note})</span>}
          </span>
          <span
            className={
              i.state === "expired"
                ? "font-medium text-destructive"
                : i.state === "due_soon"
                  ? "font-medium text-amber-700 dark:text-amber-400"
                  : i.state === "upcoming"
                    ? "font-medium"
                    : "text-muted-foreground"
            }
          >
            {STATE_TEXT[i.state](i)}
          </span>
        </li>
      ))}
    </ul>
  );
}
