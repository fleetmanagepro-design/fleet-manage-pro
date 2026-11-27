import type { PermissionSet } from "@/lib/permissions";

/** Trucks and trailers (PRODUCT_SPEC.md §4.1 permissions); RLS enforces the same. */
export const canEditAssets = (p: PermissionSet) => p.has("fleet.edit");
export const canChangeAssetStatus = (p: PermissionSet) => p.has("fleet.edit") || p.has("fleet.status");
export const canSetSold = (p: PermissionSet) => p.has("fleet.sell");
export const canRecordReadings = canEditAssets;
export const canCorrectReadings = (p: PermissionSet) => p.has("fleet.correct_readings");
