import type { OrgRole } from "@/modules/accounts/permissions";

/** Customers (DATABASE_SCHEMA.md §5): everyone reads; these roles edit. RLS enforces the same. */
export const CUSTOMER_EDITORS = ["owner", "admin", "dispatcher", "accounting"] as const satisfies readonly OrgRole[];
export const canEditCustomers = (role: OrgRole) => (CUSTOMER_EDITORS as readonly OrgRole[]).includes(role);
