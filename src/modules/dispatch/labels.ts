import type { Database } from "@/lib/supabase/database.types";

type Enums = Database["public"]["Enums"];
export type LoadStatus = Enums["load_status"];
export type StopType = Enums["stop_type"];
export type AccessorialType = Enums["accessorial_type"];

export const LOAD_STATUSES = [
  "planned", "dispatched", "at_pickup", "in_transit", "delivered", "invoiced", "paid", "cancelled",
] as const satisfies readonly LoadStatus[];

export const LOAD_STATUS_LABELS: Record<LoadStatus, string> = {
  planned: "Planned",
  dispatched: "Dispatched",
  at_pickup: "At pickup",
  in_transit: "In transit",
  delivered: "Delivered",
  invoiced: "Invoiced",
  paid: "Paid",
  cancelled: "Cancelled",
};

export const ACCESSORIAL_TYPES = [
  "on_time_bonus", "late_penalty", "detention", "layover", "lumper", "tonu", "stop_off", "other",
] as const satisfies readonly AccessorialType[];
export const ACCESSORIAL_LABELS: Record<AccessorialType, string> = {
  on_time_bonus: "On-time bonus",
  late_penalty: "Late penalty (deducted)",
  detention: "Detention",
  layover: "Layover",
  lumper: "Lumper",
  tonu: "TONU",
  stop_off: "Stop-off",
  other: "Other",
};
