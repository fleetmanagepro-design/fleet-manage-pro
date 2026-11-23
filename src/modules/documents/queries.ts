import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/database.types";
import type { DocumentEntity } from "./rules";

export type DocumentRow = Tables<"documents">;

const ENTITY_COLUMN = { driver: "driver_id", truck: "truck_id", trailer: "trailer_id" } as const;

/** Current (not archived) documents of one driver, truck or trailer, newest first. [] if the role may not see them (RLS). */
export async function listDocuments(organizationId: string, entity: DocumentEntity, entityId: string): Promise<DocumentRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("documents").select("*")
    .eq("organization_id", organizationId).eq(ENTITY_COLUMN[entity], entityId).is("archived_at", null)
    .order("uploaded_at", { ascending: false });
  if (error) {
    console.error("listDocuments failed", { entity, entityId, error });
    throw new Error("Could not load documents.");
  }
  return data ?? [];
}
