import { StatusPill, type Tone } from "@/components/status-pill";
import { STATUS_LABELS, type AssetStatus } from "../labels";

export { ComplianceList, ComplianceSummary } from "@/components/expiry-badges";

const TONE: Record<AssetStatus, Tone> = {
  active: "green",
  in_shop: "amber",
  out_of_service: "red",
  sold: "neutral",
};

export function AssetStatusBadge({ status, archived }: { status: AssetStatus; archived?: boolean }) {
  return (
    <span className="inline-flex gap-1">
      <StatusPill tone={TONE[status]}>{STATUS_LABELS[status]}</StatusPill>
      {archived && <StatusPill tone="neutral">Archived</StatusPill>}
    </span>
  );
}
