import type { PermissionSet } from "@/lib/permissions";

/**
 * Documents on drivers, trucks and trailers (decision of 11/23/2026; PRODUCT_SPEC §4.12).
 * Mirrors the database (0008a): the types per entity, PDF/JPG/PNG up to 20 MB, who sees and adds them.
 */

export const DOCUMENT_ENTITIES = ["driver", "truck", "trailer"] as const;
export type DocumentEntity = (typeof DOCUMENT_ENTITIES)[number];

export const DOC_TYPES = {
  driver: ["cdl", "medical_card", "mvr", "drug_test", "application", "other"],
  truck: ["registration", "insurance", "annual_inspection", "lease_title", "permits", "other"],
  trailer: ["registration", "annual_inspection", "lease_title", "other"],
} as const satisfies Record<DocumentEntity, readonly string[]>;

export const DOC_TYPE_LABELS: Record<string, string> = {
  cdl: "CDL",
  medical_card: "Medical card",
  mvr: "MVR",
  drug_test: "Drug test",
  application: "Application",
  registration: "Registration",
  insurance: "Insurance",
  annual_inspection: "Annual inspection",
  lease_title: "Lease / title",
  permits: "IFTA / permits",
  other: "Other",
};

export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;
export const DOCUMENT_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png"] as const;

/** Why a picked file can't be uploaded, or null when it's fine. */
export function fileProblem(file: { name: string; size: number; type: string }): string | null {
  if (file.size === 0) return "This file is empty.";
  if (file.size > MAX_DOCUMENT_BYTES) return "Files can be up to 20 MB.";
  if (!(DOCUMENT_MIME_TYPES as readonly string[]).includes(file.type)) return "Only PDF, JPG and PNG files can be uploaded.";
  return null;
}

/** A file name safe for a storage path: letters, digits, dot, dash and underscore; keeps the extension. */
export function safeFileName(name: string): string {
  const cleaned = name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w.-]+/g, "_").replace(/_+/g, "_").replace(/^[._]+/, "");
  const dot = cleaned.lastIndexOf(".");
  const ext = dot > 0 ? cleaned.slice(dot).slice(0, 10) : "";
  const base = (dot > 0 ? cleaned.slice(0, dot) : cleaned).slice(0, 90) || "document";
  return base + ext;
}

/** {organization}/{entity}/{document}/{file}: the layout the storage policies check. */
export const documentPath = (organizationId: string, entity: DocumentEntity, documentId: string, fileName: string) =>
  `${organizationId}/${entity}/${documentId}/${safeFileName(fileName)}`;

/** Seeing follows the entity (drivers / trucks and trailers); adding and removing are permissions. Mirrors 0009b. */
export const canViewDocuments = (p: PermissionSet, entity: DocumentEntity) =>
  p.has(entity === "driver" ? "drivers.view" : "fleet.view");
export const canAddDocuments = (p: PermissionSet, entity: DocumentEntity) => canViewDocuments(p, entity) && p.has("documents.add");
export const canArchiveDocuments = (p: PermissionSet, entity: DocumentEntity) =>
  canViewDocuments(p, entity) && p.has("documents.remove");
