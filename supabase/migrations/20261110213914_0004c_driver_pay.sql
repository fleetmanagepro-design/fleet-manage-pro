-- 0004c_driver_pay
-- How drivers are actually paid (decisions of 11/10/2026, PRODUCT_SPEC §3 "Driver pay"):
--   * Owner-operators keep a percentage of the load value; the rest is the company fee
--     (stored as driver_pay_rules.pay_type = 'percent', percent = driver share, basis 'total').
--   * Company drivers get a rate per mile (loaded or all miles), set per driver.
--   * Load value = linehaul + fuel surcharge + accessorials billed to the customer
--     (e.g. on-time bonus) − late penalties the broker deducts.
--   * Driver extras on a load (e.g. unloading it themselves) are paid in full, no fee.
--   * Recurring deductions per driver (truck rent %, trailer rent $/week, …) are free-form.

-- Broker adjustments on a load. Penalties reduce the load value.
alter type public.accessorial_type add value if not exists 'on_time_bonus';
alter type public.accessorial_type add value if not exists 'late_penalty';

-- ---------------------------------------------------------------------------
-- Driver extras on a load
-- ---------------------------------------------------------------------------

create table public.load_driver_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  load_id uuid not null,
  driver_id uuid not null,
  description text not null check (length(btrim(description)) between 1 and 200),
  amount_cents bigint not null check (amount_cents > 0),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  foreign key (organization_id, load_id) references public.loads (organization_id, id),
  foreign key (organization_id, driver_id) references public.drivers (organization_id, id)
);
create index load_driver_items_org_idx on public.load_driver_items (organization_id);
create index load_driver_items_load_idx on public.load_driver_items (load_id);
create index load_driver_items_driver_idx on public.load_driver_items (driver_id);

-- The driver must be on the load.
create or replace function public.load_driver_items_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.load_drivers where load_id = new.load_id and driver_id = new.driver_id) then
    raise exception 'This driver is not on the load' using errcode = 'P0001', hint = 'driver_not_on_load';
  end if;
  return new;
end;
$$;
revoke execute on function public.load_driver_items_check() from public, anon, authenticated;
create trigger load_driver_items_check before insert or update on public.load_driver_items
  for each row execute function public.load_driver_items_check();

create trigger audit_load_driver_items after insert or update or delete on public.load_driver_items
  for each row execute function public.audit_trigger();

-- ---------------------------------------------------------------------------
-- Recurring deductions per driver
-- ---------------------------------------------------------------------------

create type public.deduction_kind as enum ('percent_of_gross', 'fixed_weekly');

create table public.driver_deductions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  driver_id uuid not null,
  name text not null check (length(btrim(name)) between 1 and 100),
  kind public.deduction_kind not null,
  percent numeric(5, 2) check (percent > 0 and percent <= 100),
  amount_cents bigint check (amount_cents > 0),
  starts_on date not null,
  ends_on date,
  notes text check (length(notes) <= 500),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id, driver_id) references public.drivers (organization_id, id),
  constraint driver_deductions_shape check (
    (kind = 'percent_of_gross' and percent is not null and amount_cents is null)
    or (kind = 'fixed_weekly' and amount_cents is not null and percent is null)
  ),
  constraint driver_deductions_dates check (ends_on is null or ends_on >= starts_on)
);
create index driver_deductions_org_idx on public.driver_deductions (organization_id);
create index driver_deductions_driver_idx on public.driver_deductions (driver_id);

create trigger driver_deductions_set_updated_at before update on public.driver_deductions
  for each row execute function public.set_updated_at();
create trigger audit_driver_deductions after insert or update on public.driver_deductions
  for each row execute function public.audit_trigger();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.load_driver_items enable row level security;
alter table public.driver_deductions enable row level security;

-- Dispatch records extras on loads (e.g. "unloaded the truck himself"); pay people see them too.
create policy "dispatch and pay read" on public.load_driver_items
  for select to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin', 'dispatcher', 'accounting']::public.org_role[]));
create policy "dispatch and pay write" on public.load_driver_items
  for all to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin', 'dispatcher', 'accounting']::public.org_role[]))
  with check (public.has_org_role(organization_id, array['owner', 'admin', 'dispatcher', 'accounting']::public.org_role[]));

-- Deductions are pay: same audience as pay rules.
create policy "pay readers" on public.driver_deductions
  for select to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin', 'accounting']::public.org_role[]));
create policy "pay editors insert" on public.driver_deductions
  for insert to authenticated
  with check (public.has_org_role(organization_id, array['owner', 'admin', 'accounting']::public.org_role[]));
create policy "pay editors update" on public.driver_deductions
  for update to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin', 'accounting']::public.org_role[]))
  with check (public.has_org_role(organization_id, array['owner', 'admin', 'accounting']::public.org_role[]));

revoke all on public.load_driver_items, public.driver_deductions from anon;
revoke update, truncate on public.load_driver_items from authenticated;
revoke update, delete, truncate on public.driver_deductions from authenticated;
-- A deduction is ended (ends_on), never deleted, so past statements stay explainable.
grant update (name, ends_on, notes) on public.driver_deductions to authenticated;
