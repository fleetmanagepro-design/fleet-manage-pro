import type { PermissionSet } from "@/lib/permissions";

/** Customers (PRODUCT_SPEC.md §4.1 permissions); RLS enforces the same. */
export const canEditCustomers = (p: PermissionSet) => p.has("customers.edit");
