import type { Database } from "@/lib/supabase/database.types";

type Enums = Database["public"]["Enums"];
export type CustomerType = Enums["customer_type"];
export type CustomerStatus = Enums["customer_status"];

export const CUSTOMER_TYPES = ["broker", "shipper", "both"] as const satisfies readonly CustomerType[];
export const CUSTOMER_STATUSES = ["active", "inactive", "do_not_use"] as const satisfies readonly CustomerStatus[];

export const CUSTOMER_TYPE_LABELS: Record<CustomerType, string> = {
  broker: "Broker",
  shipper: "Shipper",
  both: "Broker & shipper",
};
export const CUSTOMER_STATUS_LABELS: Record<CustomerStatus, string> = {
  active: "Active",
  inactive: "Inactive",
  do_not_use: "Do not use",
};
