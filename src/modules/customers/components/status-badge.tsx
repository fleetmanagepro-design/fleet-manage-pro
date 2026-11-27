import { StatusPill, type Tone } from "@/components/status-pill";
import { CUSTOMER_STATUS_LABELS, type CustomerStatus } from "../labels";

const TONE: Record<CustomerStatus, Tone> = {
  active: "green",
  inactive: "neutral",
  do_not_use: "red",
};

export function CustomerStatusBadge({ status, archived }: { status: CustomerStatus; archived?: boolean }) {
  return (
    <span className="inline-flex gap-1">
      <StatusPill tone={TONE[status]}>{CUSTOMER_STATUS_LABELS[status]}</StatusPill>
      {archived && <StatusPill tone="neutral">Archived</StatusPill>}
    </span>
  );
}
