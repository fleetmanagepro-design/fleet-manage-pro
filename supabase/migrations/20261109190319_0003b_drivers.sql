-- 0003b_drivers
-- Drivers and their pay rules.
--
-- Business rules (docs/PRODUCT_SPEC.md §3 "Driver pay", §4.7 and decisions of 11/09/2026):
--   * Drivers are never deleted: status inactive/terminated, or archived.
--   * Owner/admin/accounting edit drivers; dispatcher and maintenance read drivers
--     but never pay; viewers see no drivers (DATABASE_SCHEMA.md §5).
--   * Pay rules are history: a raise is a new rule with an effective date. A rule
--     that is already in effect (effective_from <= today in the org's time zone)
--     can't be changed or deleted; future rules can.
--   * The rule that applies to a load is the latest with effective_from <= delivery date.
--   * A driver's default truck is stored on the driver; a truck's drivers are the
--     drivers pointing at it (two for a team).

create type public.driver_type as enum ('company', 'owner_operator', 'team');
create type public.driver_status as enum ('active', 'inactive', 'terminated');
create type public.cdl_class as enum ('A', 'B', 'C');
create type public.pay_type as enum ('per_mile', 'percent', 'flat');
create type public.miles_basis as enum ('loaded', 'all');
create type public.percent_basis as enum ('linehaul', 'linehaul_fsc', 'total');

-- Today's date where the organization operates.
create or replace function public.org_today(org uuid)
returns date
language sql stable security definer
set search_path = ''
as $$
  select (now() at time zone timezone)::date from public.organizations where id = org;
$$;
revoke execute on function public.org_today(uuid) from public, anon;
grant execute on function public.org_today(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- drivers
-- ---------------------------------------------------------------------------

create table public.drivers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  first_name text not null check (length(btrim(first_name)) between 1 and 100),
  last_name text not null check (length(btrim(last_name)) between 1 and 100),
  phone text check (length(phone) <= 30),
  email text check (email = lower(btrim(email)) and email like '%_@_%' and length(email) <= 254),
  driver_type public.driver_type not null default 'company',
  hire_date date,
  status public.driver_status not null default 'active',
  cdl_number text check (length(btrim(cdl_number)) between 1 and 30),
  cdl_state char(2) check (cdl_state ~ '^[A-Z]{2}$'),
  cdl_class public.cdl_class,
  cdl_expires_on date,
  medical_card_expires_on date,
  default_truck_id uuid,
  emergency_contact_name text check (length(emergency_contact_name) <= 200),
  emergency_contact_phone text check (length(emergency_contact_phone) <= 30),
  notes text check (length(notes) <= 5000),
  archived_at timestamptz,
  archived_by uuid references auth.users (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, default_truck_id) references public.trucks (organization_id, id),
  constraint drivers_cdl_state_with_number check (cdl_number is null or cdl_state is not null)
);

create unique index drivers_cdl_uniq on public.drivers (organization_id, cdl_state, upper(cdl_number))
  where archived_at is null and cdl_number is not null;
create index drivers_org_status_idx on public.drivers (organization_id, status);
create index drivers_default_truck_idx on public.drivers (default_truck_id) where default_truck_id is not null;

create trigger drivers_set_updated_at before update on public.drivers
  for each row execute function public.set_updated_at();

-- Who archived a row (generic; used for drivers, reusable later).
create or replace function public.set_archived_by()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.archived_at is null and new.archived_at is not null then
    new.archived_by := (select auth.uid());
  elsif new.archived_at is null then
    new.archived_by := null;
  end if;
  return new;
end;
$$;

create trigger drivers_archived_by before update on public.drivers
  for each row execute function public.set_archived_by();

-- ---------------------------------------------------------------------------
-- driver_pay_rules
-- ---------------------------------------------------------------------------

create table public.driver_pay_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  driver_id uuid not null,
  effective_from date not null,
  pay_type public.pay_type not null,
  rate_cents_per_mile int check (rate_cents_per_mile between 1 and 10000),
  miles_basis public.miles_basis,
  percent numeric(5, 2) check (percent > 0 and percent <= 100),
  percent_basis public.percent_basis,
  flat_cents bigint check (flat_cents > 0),
  stop_pay_cents bigint not null default 0 check (stop_pay_cents >= 0),
  detention_pay_cents_per_hour bigint not null default 0 check (detention_pay_cents_per_hour >= 0),
  notes text check (length(notes) <= 1000),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id, driver_id) references public.drivers (organization_id, id),
  unique (driver_id, effective_from),
  -- exactly the fields of the chosen pay type are set
  constraint driver_pay_rules_shape check (
    (pay_type = 'per_mile' and rate_cents_per_mile is not null and miles_basis is not null
       and percent is null and percent_basis is null and flat_cents is null)
    or (pay_type = 'percent' and percent is not null and percent_basis is not null
       and rate_cents_per_mile is null and miles_basis is null and flat_cents is null)
    or (pay_type = 'flat' and flat_cents is not null
       and rate_cents_per_mile is null and miles_basis is null and percent is null and percent_basis is null)
  )
);

create index driver_pay_rules_org_idx on public.driver_pay_rules (organization_id);
create index driver_pay_rules_driver_idx on public.driver_pay_rules (driver_id, effective_from desc);

create trigger driver_pay_rules_set_updated_at before update on public.driver_pay_rules
  for each row execute function public.set_updated_at();

-- Rules already in effect are history and can't change.
create or replace function public.driver_pay_rules_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := public.org_today(old.organization_id);
begin
  -- Check access before revealing anything (this function bypasses RLS).
  if (select auth.uid()) is not null
     and not public.has_org_role(old.organization_id, array['owner', 'admin', 'accounting']::public.org_role[]) then
    raise exception 'You don''t have permission to change pay rules' using errcode = '42501';
  end if;
  if old.effective_from <= v_today then
    raise exception 'A pay rule that is already in effect cannot be changed; add a new rule instead'
      using errcode = 'P0001', hint = 'pay_rule_in_effect';
  end if;
  if tg_op = 'UPDATE' and new.effective_from <= v_today then
    raise exception 'A changed pay rule must start in the future' using errcode = 'P0001', hint = 'pay_rule_in_effect';
  end if;
  return coalesce(new, old);
end;
$$;
revoke execute on function public.driver_pay_rules_guard() from public, anon, authenticated;

create trigger driver_pay_rules_guard before update or delete on public.driver_pay_rules
  for each row execute function public.driver_pay_rules_guard();

-- ---------------------------------------------------------------------------
-- Audit
-- ---------------------------------------------------------------------------

create trigger audit_drivers after insert or update on public.drivers
  for each row execute function public.audit_trigger();
create trigger audit_driver_pay_rules after insert or update or delete on public.driver_pay_rules
  for each row execute function public.audit_trigger();

-- ---------------------------------------------------------------------------
-- Row Level Security (DATABASE_SCHEMA.md §5: "Drivers, pay rules")
-- ---------------------------------------------------------------------------

alter table public.drivers enable row level security;
alter table public.driver_pay_rules enable row level security;

create policy "staff read" on public.drivers
  for select to authenticated
  using (public.has_org_role(organization_id,
    array['owner', 'admin', 'accounting', 'dispatcher', 'maintenance']::public.org_role[]));
create policy "editors insert" on public.drivers
  for insert to authenticated
  with check (public.has_org_role(organization_id, array['owner', 'admin', 'accounting']::public.org_role[]));
create policy "editors update" on public.drivers
  for update to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin', 'accounting']::public.org_role[]))
  with check (public.has_org_role(organization_id, array['owner', 'admin', 'accounting']::public.org_role[]));

create policy "pay readers" on public.driver_pay_rules
  for select to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin', 'accounting']::public.org_role[]));
create policy "pay editors insert" on public.driver_pay_rules
  for insert to authenticated
  with check (public.has_org_role(organization_id, array['owner', 'admin', 'accounting']::public.org_role[]));
create policy "pay editors update" on public.driver_pay_rules
  for update to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin', 'accounting']::public.org_role[]))
  with check (public.has_org_role(organization_id, array['owner', 'admin', 'accounting']::public.org_role[]));
create policy "pay editors delete future" on public.driver_pay_rules
  for delete to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin', 'accounting']::public.org_role[]));

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

revoke all on public.drivers, public.driver_pay_rules from anon;

revoke update, delete, truncate on public.drivers from authenticated;
grant update (first_name, last_name, phone, email, driver_type, hire_date, status, cdl_number, cdl_state,
  cdl_class, cdl_expires_on, medical_card_expires_on, default_truck_id, emergency_contact_name,
  emergency_contact_phone, notes, archived_at) on public.drivers to authenticated;

revoke update, truncate on public.driver_pay_rules from authenticated;
grant update (effective_from, pay_type, rate_cents_per_mile, miles_basis, percent, percent_basis, flat_cents,
  stop_pay_cents, detention_pay_cents_per_hour, notes) on public.driver_pay_rules to authenticated;
