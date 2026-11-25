"use server";

import { authorizeAction } from "@/lib/auth";
import { globalSearch } from "./queries";
import { type SearchHit, searchTerm } from "./search";

/** Search box in the menu. [] when there's nothing to search or the user isn't signed in. */
export async function searchEverything(input: unknown): Promise<SearchHit[]> {
  const ctx = await authorizeAction();
  const term = typeof input === "string" ? searchTerm(input) : null;
  if (!ctx || !term) return [];
  try {
    return await globalSearch(ctx.active.organizationId, term);
  } catch {
    return [];
  }
}
