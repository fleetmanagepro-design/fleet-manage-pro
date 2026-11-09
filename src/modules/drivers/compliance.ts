import { type ExpiryItem, expiryItem } from "@/lib/expiry";

/** CDL and medical card warn at 60 and 30 days and on expiry (PRODUCT_SPEC.md §4.7 AC). */
export const DRIVER_THRESHOLDS = { soonDays: 30, upcomingDays: 60 } as const;

export type DriverComplianceItem = ExpiryItem<"cdl" | "medical_card">;

export function driverCompliance(
  driver: { cdl_expires_on: string | null; medical_card_expires_on: string | null },
  today: string,
): DriverComplianceItem[] {
  return [
    expiryItem("cdl" as const, "CDL", driver.cdl_expires_on, today, DRIVER_THRESHOLDS),
    expiryItem("medical_card" as const, "Medical card", driver.medical_card_expires_on, today, DRIVER_THRESHOLDS),
  ];
}

/** An expired CDL or medical card blocks assignment to a load (used by dispatch). */
export function isBlockedFromDriving(items: DriverComplianceItem[]): boolean {
  return items.some((i) => i.state === "expired");
}
