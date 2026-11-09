import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/database.types";
import type { CustomerStatus, CustomerType } from "./labels";
import { mcDigits } from "./search";

export type Customer = Tables<"customers">;
export type CustomerContact = Tables<"customer_contacts">;

export type CustomerFilter = {
  /** Already sanitized with sanitizeSearch(). */
  search?: string;
  type?: CustomerType;
  status?: CustomerStatus;
  includeArchived?: boolean;
};

export async function listCustomers(organizationId: string, filter: CustomerFilter = {}): Promise<Customer[]> {
  const supabase = await createClient();
  let q = supabase.from("customers").select("*").eq("organization_id", organizationId);
  if (filter.type) q = q.eq("customer_type", filter.type);
  if (filter.status) q = q.eq("status", filter.status);
  if (!filter.includeArchived) q = q.is("archived_at", null);
  if (filter.search) {
    const mc = mcDigits(filter.search);
    q = mc
      ? q.or(`name.ilike.%${filter.search}%,mc_number.eq.${mc}`)
      : q.ilike("name", `%${filter.search}%`);
  }
  const { data, error } = await q.order("name").limit(500);
  if (error) {
    console.error("listCustomers failed", { organizationId, error });
    throw new Error("Could not load customers.");
  }
  return data ?? [];
}

export async function getCustomer(organizationId: string, id: string): Promise<Customer | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customers").select("*").eq("organization_id", organizationId).eq("id", id).maybeSingle();
  if (error) {
    console.error("getCustomer failed", { id, error });
    throw new Error("Could not load this customer.");
  }
  return data;
}

export async function listContacts(organizationId: string, customerId: string): Promise<CustomerContact[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customer_contacts")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("customer_id", customerId)
    .order("name");
  if (error) {
    console.error("listContacts failed", { customerId, error });
    throw new Error("Could not load contacts.");
  }
  return data ?? [];
}
