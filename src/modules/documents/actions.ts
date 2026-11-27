"use server";

import { refresh } from "next/cache";
import { type ActionState, errorState } from "@/lib/action-state";
import { authorizeAction } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { canAddDocuments, documentPath } from "./rules";
import { documentIdSchema, registerDocumentSchema } from "./schemas";

const NO_PERMISSION = "You don't have permission to do that.";
const UNEXPECTED = "Something went wrong. Please try again.";

export type RegisterResult = { ok: true } | { ok: false; message: string; field?: string };

/**
 * Records a document after the browser uploaded its file to Storage. The path is rebuilt here and the
 * database copies the file's real size and type from Storage (0008a), so nothing about the file is trusted
 * from the browser.
 */
export async function registerDocument(input: unknown): Promise<RegisterResult> {
  const ctx = await authorizeAction();
  if (!ctx) return { ok: false, message: NO_PERMISSION };
  const parsed = registerDocumentSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, message: issue?.message ?? UNEXPECTED, field: issue?.path.join(".") };
  }
  const d = parsed.data;
  if (!canAddDocuments(ctx.active.permissions, d.entityType)) return { ok: false, message: NO_PERMISSION };
  const path = documentPath(ctx.active.organizationId, d.entityType, d.documentId, d.fileName);
  if (path !== d.storagePath) return { ok: false, message: UNEXPECTED };

  const supabase = await createClient();
  const { error } = await supabase.from("documents").insert({
    id: d.documentId,
    organization_id: ctx.active.organizationId,
    entity_type: d.entityType,
    driver_id: d.entityType === "driver" ? d.entityId : null,
    truck_id: d.entityType === "truck" ? d.entityId : null,
    trailer_id: d.entityType === "trailer" ? d.entityId : null,
    doc_type: d.docType,
    file_name: d.fileName,
    storage_path: path,
    // Overwritten by the database from Storage's own record of the file.
    mime_type: "application/pdf",
    size_bytes: 1,
    expires_on: d.expiresOn ?? null,
    notes: d.notes ?? null,
  });
  if (error) {
    if (error.hint === "file_missing") return { ok: false, message: "The upload didn't finish. Please try again." };
    if (error.code === "42501" || error.code === "23503") return { ok: false, message: NO_PERMISSION };
    console.error("[documents.registerDocument]", { error });
    return { ok: false, message: UNEXPECTED };
  }
  refresh();
  return { ok: true };
}

/** A link to open a document, valid for one minute. Null when it can't be seen. */
export async function documentUrl(id: string): Promise<string | null> {
  const ctx = await authorizeAction();
  const parsed = documentIdSchema.safeParse({ id });
  if (!ctx || !parsed.success) return null;
  const supabase = await createClient();
  const { data: doc } = await supabase.from("documents").select("storage_path")
    .eq("organization_id", ctx.active.organizationId).eq("id", parsed.data.id).maybeSingle();
  if (!doc) return null;
  const { data, error } = await supabase.storage.from("documents").createSignedUrl(doc.storage_path, 60);
  if (error) {
    console.error("[documents.documentUrl]", { error });
    return null;
  }
  return data.signedUrl;
}

export async function archiveDocument(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await authorizeAction("documents.remove");
  if (!ctx) return errorState(NO_PERMISSION);
  const parsed = documentIdSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return errorState(UNEXPECTED);
  const supabase = await createClient();
  const { error } = await supabase.rpc("archive_document", { p_document: parsed.data.id });
  if (error) {
    if (error.code === "42501") return errorState(NO_PERMISSION);
    console.error("[documents.archiveDocument]", { error });
    return errorState(UNEXPECTED);
  }
  refresh();
  return { status: "success", message: "Document removed." };
}
