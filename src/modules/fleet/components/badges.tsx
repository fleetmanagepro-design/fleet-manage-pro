import { Badge } from "@/components/ui/badge";
import { STATUS_LABELS, type AssetStatus } from "../labels";

export { ComplianceList, ComplianceSummary } from "@/components/expiry-badges";

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
