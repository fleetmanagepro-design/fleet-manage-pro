-- 0003c_customers
-- Customers (brokers / shippers) and their contacts.
--
-- Business rules (docs/PRODUCT_SPEC.md §4.3 and decisions of 11/09/2026):
--   * Status: active, inactive, do_not_use (do_not_use requires a reason; such a
--     customer can't get new loads — enforced when loads exist).
--   * MC number is unique per organization among non-archived customers; names may repeat.
--   * Customers are never deleted, only archived. Contacts can be removed.
--   * Owner/admin/dispatcher/accounting edit; maintenance and viewer read.

create type public.customer_type as enum ('broker', 'shipper', 'both');
create type public.customer_status as enum ('active', 'inactive', 'do_not_use');

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  name text not null check (length(btrim(name)) between 1 and 200),
  customer_type public.customer_type not null default 'broker',
  mc_number text check (mc_number ~ '^[0-9]{1,8}$'),
  billing_email text check (billing_email = lower(btrim(billing_email)) and billing_email like '%_@_%' and length(billing_email) <= 254),
  phone text check (length(phone) <= 30),
  address_line1 text check (length(address_line1) <= 200),
  city text check (length(city) <= 100),
  state char(2) check (state ~ '^[A-Z]{2}$'),
  zip text check (zip ~ '^[0-9]{5}(-[0-9]{4})?$'),
  payment_terms_days int not null default 30 check (payment_terms_days between 0 and 180),
  status public.customer_status not null default 'active',
  do_not_use_reason text check (length(do_not_use_reason) <= 1000),
  notes text check (length(notes) <= 5000),
  archived_at timestamptz,
  archived_by uuid references auth.users (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  constraint customers_do_not_use_reason check (
    status <> 'do_not_use' or coalesce(length(btrim(do_not_use_reason)), 0) > 0
  )
);

create unique index customers_mc_uniq on public.customers (organization_id, mc_number)
  where archived_at is null and mc_number is not null;
create index customers_org_name_idx on public.customers (organization_id, lower(name));
create index customers_org_status_idx on public.customers (organization_id, status);

create table public.customer_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  customer_id uuid not null,
  name text not null check (length(btrim(name)) between 1 and 200),
  email text check (email = lower(btrim(email)) and email like '%_@_%' and length(email) <= 254),
  phone text check (length(phone) <= 30),
  role text check (length(role) <= 100),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id, customer_id) references public.customers (organization_id, id)
);

create index customer_contacts_org_idx on public.customer_contacts (organization_id);
create index customer_contacts_customer_idx on public.customer_contacts (customer_id);

create trigger customers_set_updated_at before update on public.customers
  for each row execute function public.set_updated_at();
create trigger customers_archived_by before update on public.customers
  for each row execute function public.set_archived_by();
create trigger customer_contacts_set_updated_at before update on public.customer_contacts
  for each row execute function public.set_updated_at();

create trigger audit_customers after insert or update on public.customers
  for each row execute function public.audit_trigger();
create trigger audit_customer_contacts after insert or update or delete on public.customer_contacts
  for each row execute function public.audit_trigger();

-- ---------------------------------------------------------------------------
-- Row Level Security (DATABASE_SCHEMA.md §5: Customers)
-- ---------------------------------------------------------------------------

alter table public.customers enable row level security;
alter table public.customer_contacts enable row level security;

create policy "members read" on public.customers
  for select to authenticated using (public.is_org_member(organization_id));
create policy "editors insert" on public.customers
  for insert to authenticated
  with check (public.has_org_role(organization_id, array['owner', 'admin', 'dispatcher', 'accounting']::public.org_role[]));
create policy "editors update" on public.customers
  for update to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin', 'dispatcher', 'accounting']::public.org_role[]))
  with check (public.has_org_role(organization_id, array['owner', 'admin', 'dispatcher', 'accounting']::public.org_role[]));

create policy "members read" on public.customer_contacts
  for select to authenticated using (public.is_org_member(organization_id));
create policy "editors insert" on public.customer_contacts
  for insert to authenticated
  with check (public.has_org_role(organization_id, array['owner', 'admin', 'dispatcher', 'accounting']::public.org_role[]));
create policy "editors update" on public.customer_contacts
  for update to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin', 'dispatcher', 'accounting']::public.org_role[]))
  with check (public.has_org_role(organization_id, array['owner', 'admin', 'dispatcher', 'accounting']::public.org_role[]));
create policy "editors delete" on public.customer_contacts
  for delete to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin', 'dispatcher', 'accounting']::public.org_role[]));

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

revoke all on public.customers, public.customer_contacts from anon;

revoke update, delete, truncate on public.customers from authenticated;
grant update (name, customer_type, mc_number, billing_email, phone, address_line1, city, state, zip,
  payment_terms_days, status, do_not_use_reason, notes, archived_at) on public.customers to authenticated;

revoke update, truncate on public.customer_contacts from authenticated;
grant update (name, email, phone, role) on public.customer_contacts to authenticated;
