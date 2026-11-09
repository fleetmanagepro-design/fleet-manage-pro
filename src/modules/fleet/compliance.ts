import { addMonths, formatCalendarDate } from "@/lib/dates";
import { type ExpiryItem, type ExpiryState, expiryItem } from "@/lib/expiry";

export { worstState } from "@/lib/expiry";

/** Expirations within this many days are flagged (PRODUCT_SPEC.md §4.5 AC). */
export const DUE_SOON_DAYS = 30;

export type ComplianceState = ExpiryState;
export type ComplianceItem = ExpiryItem<"registration" | "annual_inspection" | "insurance">;

export type ComplianceInput = {
  registration_expires_on: string | null;
  /** Date of the last periodic inspection. */
  annual_inspection_on: string | null;
  /** How long that inspection is valid: 3, 6, 9 or 12 months (entered by the user). */
  annual_inspection_valid_months: number;
  /** Trucks only. */
  insurance_expires_on?: string | null;
};

/** Registration, inspection and (trucks) insurance status as of `today`. */
export function complianceItems(asset: ComplianceInput, today: string): ComplianceItem[] {
  const t = { soonDays: DUE_SOON_DAYS };
  const last = asset.annual_inspection_on;
  const months = asset.annual_inspection_valid_months;
  const inspection = expiryItem("annual_inspection" as const, "Inspection", last ? addMonths(last, months) : null, today, t);
  if (last) inspection.note = `last ${formatCalendarDate(last)}, valid ${months} months`;

  const items: ComplianceItem[] = [
    expiryItem("registration" as const, "Registration", asset.registration_expires_on, today, t),
    inspection,
  ];
  if (asset.insurance_expires_on !== undefined) {
    items.push(expiryItem("insurance" as const, "Insurance", asset.insurance_expires_on, today, t));
  }
  return items;
}
