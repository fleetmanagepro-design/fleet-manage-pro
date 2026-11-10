import { Badge } from "@/components/ui/badge";
import { LOAD_STATUS_LABELS, type LoadStatus } from "../labels";

const VARIANT: Record<LoadStatus, "default" | "secondary" | "destructive" | "outline"> = {
  planned: "outline",
  dispatched: "secondary",
  at_pickup: "secondary",
  in_transit: "secondary",
  delivered: "default",
  invoiced: "default",
  paid: "default",
  cancelled: "destructive",
};

export function LoadStatusBadge({ status }: { status: LoadStatus }) {
  return <Badge variant={VARIANT[status]}>{LOAD_STATUS_LABELS[status]}</Badge>;
}
