import type { Database } from "@/lib/supabase/database.types";

type Enums = Database["public"]["Enums"];
export type DriverType = Enums["driver_type"];
export type DriverStatus = Enums["driver_status"];
export type CdlClass = Enums["cdl_class"];
export type PayType = Enums["pay_type"];
export type MilesBasis = Enums["miles_basis"];
export type PercentBasis = Enums["percent_basis"];

export const DRIVER_TYPES = ["company", "owner_operator", "team"] as const satisfies readonly DriverType[];
export const DRIVER_STATUSES = ["active", "inactive", "terminated"] as const satisfies readonly DriverStatus[];
export const CDL_CLASSES = ["A", "B", "C"] as const satisfies readonly CdlClass[];
export const PAY_TYPES = ["per_mile", "percent", "flat"] as const satisfies readonly PayType[];
export const MILES_BASES = ["loaded", "all"] as const satisfies readonly MilesBasis[];
export const PERCENT_BASES = ["linehaul", "linehaul_fsc", "total"] as const satisfies readonly PercentBasis[];

export const DRIVER_TYPE_LABELS: Record<DriverType, string> = {
  company: "Company driver",
  owner_operator: "Owner-operator",
  team: "Team",
};
export const DRIVER_STATUS_LABELS: Record<DriverStatus, string> = {
  active: "Active",
  inactive: "Inactive",
  terminated: "Terminated",
};
export const PAY_TYPE_LABELS: Record<PayType, string> = {
  per_mile: "Per mile",
  percent: "Percent of revenue",
  flat: "Flat per load",
};
export const MILES_BASIS_LABELS: Record<MilesBasis, string> = { loaded: "loaded miles", all: "all miles" };
export const PERCENT_BASIS_LABELS: Record<PercentBasis, string> = {
  linehaul: "linehaul",
  linehaul_fsc: "linehaul + fuel surcharge",
  total: "total load revenue",
};
