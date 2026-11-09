import { Badge } from "@/components/ui/badge";
import { formatCalendarDate } from "@/lib/dates";
import { type ComplianceItem, type ComplianceState, worstState } from "../compliance";
import { STATUS_LABELS, type AssetStatus } from "../labels";

const STATUS_VARIANT: Record<AssetStatus, "default" | "secondary" | "destructive" | "outline"> = {
  active: "default",
  in_shop: "secondary",
  out_of_service: "destructive",
  sold: "outline",
};

export function AssetStatusBadge({ status, archived }: { status: AssetStatus; archived?: boolean }) {
  return (
    <span className="inline-flex gap-1">
      <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABELS[status]}</Badge>
      {archived && <Badge variant="outline">Archived</Badge>}
    </span>
  );
}

/** One badge summarising the most urgent expiration, for list rows. */
export function ComplianceSummary({ items }: { items: ComplianceItem[] }) {
  const state = worstState(items);
  const urgent = items.filter((i) => i.state === state);
  if (state === "ok") return <span className="text-xs text-muted-foreground">OK</span>;
  if (state === "missing") return <span className="text-xs text-muted-foreground">No dates</span>;
  const text = urgent.map((i) => i.label).join(", ");
  return (
    <Badge variant={state === "expired" ? "destructive" : "secondary"} title={text}>
      {state === "expired" ? "Expired" : "Due soon"}: {text}
    </Badge>
  );
}

const STATE_TEXT: Record<ComplianceState, (i: ComplianceItem) => string> = {
  expired: (i) => `Expired ${Math.abs(i.daysLeft ?? 0)} day${Math.abs(i.daysLeft ?? 0) === 1 ? "" : "s"} ago`,
  due_soon: (i) => (i.daysLeft === 0 ? "Expires today" : `Due in ${i.daysLeft} day${i.daysLeft === 1 ? "" : "s"}`),
  ok: () => "OK",
  missing: () => "Not entered",
};

export function ComplianceList({ items }: { items: ComplianceItem[] }) {
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
