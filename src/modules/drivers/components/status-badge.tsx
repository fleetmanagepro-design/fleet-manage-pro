import { StatusPill, type Tone } from "@/components/status-pill";
import { DRIVER_STATUS_LABELS, type DriverStatus } from "../labels";

const TONE: Record<DriverStatus, Tone> = {
  active: "green",
  inactive: "neutral",
  terminated: "red",
};

export function DriverStatusBadge({ status, archived }: { status: DriverStatus; archived?: boolean }) {
  return (
    <span className="inline-flex gap-1">
      <StatusPill tone={TONE[status]}>{DRIVER_STATUS_LABELS[status]}</StatusPill>
      {archived && <StatusPill tone="neutral">Archived</StatusPill>}
    </span>
  );
}
