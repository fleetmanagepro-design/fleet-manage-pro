import { Badge } from "@/components/ui/badge";
import { DRIVER_STATUS_LABELS, type DriverStatus } from "../labels";

const VARIANT: Record<DriverStatus, "default" | "secondary" | "outline"> = {
  active: "default",
  inactive: "secondary",
  terminated: "outline",
};

export function DriverStatusBadge({ status, archived }: { status: DriverStatus; archived?: boolean }) {
  return (
    <span className="inline-flex gap-1">
      <Badge variant={VARIANT[status]}>{DRIVER_STATUS_LABELS[status]}</Badge>
      {archived && <Badge variant="outline">Archived</Badge>}
    </span>
  );
}
