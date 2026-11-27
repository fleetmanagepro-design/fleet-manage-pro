import type { PermissionSet } from "@/lib/permissions";

/** Drivers and pay (PRODUCT_SPEC.md §4.1 permissions); RLS enforces the same. */
export const canViewDrivers = (p: PermissionSet) => p.has("drivers.view");
export const canEditDrivers = (p: PermissionSet) => p.has("drivers.edit");
export const canViewPay = (p: PermissionSet) => p.has("pay.view");
export const canEditPay = (p: PermissionSet) => p.has("pay.edit");
export const canFinalizeStatements = (p: PermissionSet) => p.has("pay.finalize");
/** Driver pay and contribution on the dashboard (needs pay.view to load the numbers). */
export const canSeeDashboardPay = (p: PermissionSet) => p.has("dashboard.pay") && p.has("pay.view");
