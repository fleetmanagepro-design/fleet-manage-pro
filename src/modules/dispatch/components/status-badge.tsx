import { StatusPill, type Tone } from "@/components/status-pill";
import { LOAD_STATUS_LABELS, type LoadStatus } from "../labels";

const TONE: Record<LoadStatus, Tone> = {
  planned: "neutral",
  dispatched: "blue",
  at_pickup: "amber",
  in_transit: "amber",
  delivered: "green",
  invoiced: "gold",
  paid: "gold",
  cancelled: "red",
};

export function LoadStatusBadge({ status }: { status: LoadStatus }) {
  return <StatusPill tone={TONE[status]}>{LOAD_STATUS_LABELS[status]}</StatusPill>;
}
