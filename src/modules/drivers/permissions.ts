import type { OrgRole } from "@/modules/accounts/permissions";

/** Drivers and pay (DATABASE_SCHEMA.md §5); RLS enforces the same. */
export const DRIVER_READERS = ["owner", "admin", "accounting", "dispatcher", "maintenance"] as const satisfies readonly OrgRole[];
export const DRIVER_EDITORS = ["owner", "admin", "accounting"] as const satisfies readonly OrgRole[];

export const canViewDrivers = (role: OrgRole) => (DRIVER_READERS as readonly OrgRole[]).includes(role);
export const canEditDrivers = (role: OrgRole) => (DRIVER_EDITORS as readonly OrgRole[]).includes(role);
/** Pay is visible only to those who manage it; dispatchers and maintenance never see it. */
export const canViewPay = canEditDrivers;
