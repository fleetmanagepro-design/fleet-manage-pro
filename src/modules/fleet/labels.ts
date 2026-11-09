import type { Database } from "@/lib/supabase/database.types";

type Enums = Database["public"]["Enums"];
export type AssetStatus = Enums["asset_status"];
export type Ownership = Enums["ownership_type"];
export type TrailerType = Enums["trailer_type"];
export type MeterType = Enums["meter_type"];

export const ASSET_STATUSES = ["active", "in_shop", "out_of_service", "sold"] as const satisfies readonly AssetStatus[];
export const OWNERSHIP_TYPES = ["owned", "financed", "leased"] as const satisfies readonly Ownership[];
export const TRAILER_TYPES = ["dry_van", "reefer", "flatbed", "step_deck", "other"] as const satisfies readonly TrailerType[];

export const STATUS_LABELS: Record<AssetStatus, string> = {
  active: "Active",
  in_shop: "In shop",
  out_of_service: "Out of service",
  sold: "Sold",
};
export const OWNERSHIP_LABELS: Record<Ownership, string> = { owned: "Owned", financed: "Financed", leased: "Leased" };
export const TRAILER_TYPE_LABELS: Record<TrailerType, string> = {
  dry_van: "Dry van",
  reefer: "Reefer",
  flatbed: "Flatbed",
  step_deck: "Step deck",
  other: "Other",
};
export const METER_LABELS: Record<MeterType, { label: string; unit: string }> = {
  odometer: { label: "Odometer", unit: "mi" },
  hubodometer: { label: "Hubodometer", unit: "mi" },
  reefer_hours: { label: "Reefer hours", unit: "h" },
};
