import type { OrgRole } from "@/modules/accounts/permissions";

/** Trucks and trailers role rules (DATABASE_SCHEMA.md §5); RLS enforces the same. */
export const canEditAssets = (role: OrgRole) => role === "owner" || role === "admin" || role === "maintenance";
export const canChangeAssetStatus = (role: OrgRole) => canEditAssets(role) || role === "dispatcher";
export const canSetSold = (role: OrgRole) => role === "owner" || role === "admin";
export const canRecordReadings = canEditAssets;
export const canCorrectReadings = canSetSold;

export const ASSET_EDITORS = ["owner", "admin", "maintenance"] as const satisfies readonly OrgRole[];
export const STATUS_EDITORS = ["owner", "admin", "maintenance", "dispatcher"] as const satisfies readonly OrgRole[];
