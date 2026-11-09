import { addMonths, daysBetween, formatCalendarDate } from "@/lib/dates";

/** Expirations within this many days are flagged (PRODUCT_SPEC.md §4.5 AC). */
export const DUE_SOON_DAYS = 30;

export type ComplianceState = "expired" | "due_soon" | "ok" | "missing";

export type ComplianceItem = {
  key: "registration" | "annual_inspection" | "insurance";
  label: string;
  /** Calendar date the item expires / is due, "YYYY-MM-DD". */
  dueOn: string | null;
  /** Days from today until dueOn (negative when past). */
  daysLeft: number | null;
  state: ComplianceState;
  /** Extra context, e.g. "last 03/01/2026, valid 6 months". */
  note?: string;
};

export type ComplianceInput = {
  registration_expires_on: string | null;
  /** Date of the last periodic inspection. */
  annual_inspection_on: string | null;
  /** How long that inspection is valid: 3, 6, 9 or 12 months (entered by the user). */
  annual_inspection_valid_months: number;
  /** Trucks only. */
  insurance_expires_on?: string | null;
};

function item(key: ComplianceItem["key"], label: string, dueOn: string | null, today: string): ComplianceItem {
  if (!dueOn) return { key, label, dueOn: null, daysLeft: null, state: "missing" };
  const daysLeft = daysBetween(today, dueOn);
  // An item that expires today is still valid today.
  const state: ComplianceState = daysLeft < 0 ? "expired" : daysLeft <= DUE_SOON_DAYS ? "due_soon" : "ok";
  return { key, label, dueOn, daysLeft, state };
}

/** Registration, annual inspection and (trucks) insurance status as of `today`. */
export function complianceItems(asset: ComplianceInput, today: string): ComplianceItem[] {
  const last = asset.annual_inspection_on;
  const months = asset.annual_inspection_valid_months;
  const inspection = item("annual_inspection", "Inspection", last ? addMonths(last, months) : null, today);
  if (last) inspection.note = `last ${formatCalendarDate(last)}, valid ${months} months`;

  const items = [item("registration", "Registration", asset.registration_expires_on, today), inspection];
  if (asset.insurance_expires_on !== undefined) {
    items.push(item("insurance", "Insurance", asset.insurance_expires_on, today));
  }
  return items;
}

/** The most urgent state among items, for list badges. "missing" never outranks a real date. */
export function worstState(items: ComplianceItem[]): ComplianceState {
  const order: ComplianceState[] = ["expired", "due_soon", "ok", "missing"];
  for (const s of order) if (items.some((i) => i.state === s)) return s;
  return "missing";
}
