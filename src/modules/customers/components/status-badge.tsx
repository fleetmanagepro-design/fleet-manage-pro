import { Badge } from "@/components/ui/badge";
import { CUSTOMER_STATUS_LABELS, type CustomerStatus } from "../labels";

const VARIANT: Record<CustomerStatus, "default" | "secondary" | "destructive"> = {
  active: "default",
  inactive: "secondary",
  do_not_use: "destructive",
};

export function CustomerStatusBadge({ status, archived }: { status: CustomerStatus; archived?: boolean }) {
  return (
    <span className="inline-flex gap-1">
      <Badge variant={VARIANT[status]}>{CUSTOMER_STATUS_LABELS[status]}</Badge>
      {archived && <Badge variant="outline">Archived</Badge>}
    </span>
  );
}
