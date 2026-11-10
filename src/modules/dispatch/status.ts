import type { OrgRole } from "@/modules/accounts/permissions";
import type { LoadStatus } from "./labels";

/** Mirrors change_load_status() in 0004_loads so the UI only offers what the database allows. */
const FLOW: LoadStatus[] = ["planned", "dispatched", "at_pickup", "in_transit", "delivered"];

export const DISPATCH_EDITORS = ["owner", "admin", "dispatcher"] as const satisfies readonly OrgRole[];
export const canEditLoads = (role: OrgRole) => (DISPATCH_EDITORS as readonly OrgRole[]).includes(role);
/** Overlapping truck/driver assignments: warn; only owner/admin may override (PRODUCT_SPEC §4.4). */
export const canOverrideOverlap = (role: OrgRole) => role === "owner" || role === "admin";

export const isOpen = (s: LoadStatus) => s === "planned" || s === "dispatched" || s === "at_pickup" || s === "in_transit";

export type StatusMove = { to: LoadStatus; direction: "forward" | "back" | "cancel" | "reactivate"; needsReason: boolean };

/** Moves a user may pick from `current`. Invoiced/Paid come with invoicing. */
export function availableMoves(current: LoadStatus): StatusMove[] {
  if (current === "invoiced" || current === "paid") return [];
  if (current === "cancelled") return [{ to: "planned", direction: "reactivate", needsReason: true }];
  const i = FLOW.indexOf(current);
  const moves: StatusMove[] = [
    ...FLOW.slice(i + 1).map((to) => ({ to, direction: "forward" as const, needsReason: false })),
    ...FLOW.slice(0, i).reverse().map((to) => ({ to, direction: "back" as const, needsReason: true })),
  ];
  if (current !== "delivered") moves.push({ to: "cancelled", direction: "cancel", needsReason: true });
  return moves;
}
