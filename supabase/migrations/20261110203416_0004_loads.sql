-- 0004_loads
-- Loads, stops, load drivers, accessorials and status history.
--
-- Business rules (docs/PRODUCT_SPEC.md §3, §4.4 and decisions of 11/10/2026):
--   * Load numbers are assigned automatically per organization (1001, 1002, …) and may be
--     changed; they are unique per organization (case-insensitive).
--   * Status moves only through change_load_status(). Forward moves are free; moving back
--     (or reactivating a cancelled load) requires a reason; owner/admin/dispatcher may do it.
--     Every change is written to load_events.
--   * Delivered requires the delivery time and loaded miles > 0.
--   * Dispatching requires a truck, at least one driver, a pickup and a delivery stop.
--   * Invoiced/Paid arrive with invoicing (Task 7); until then they can't be set.
--   * A do-not-use or archived customer, a sold or archived truck/trailer, and an inactive,
--     terminated or archived driver, or one whose CDL/medical card has expired, can't be put
--     on an open load.
--   * Stop appointment times are stored as instants (timestamptz) plus the stop's IANA
--     time zone, so they display in the facility's local time.
--   * Loads are never deleted; they are cancelled with a reason.
--   * Owner/admin/dispatcher edit loads; everyone else in the org reads them.

create type public.load_status as enum
  ('planned', 'dispatched', 'at_pickup', 'in_transit', 'delivered', 'invoiced', 'paid', 'cancelled');
create type public.stop_type as enum ('pickup', 'delivery');
create type public.accessorial_type as enum ('detention', 'layover', 'lumper', 'tonu', 'stop_off', 'other');
create type public.load_event_kind as enum ('status_change', 'assignment_override');

-- ---------------------------------------------------------------------------
-- Per-organization counters (load numbers now; invoice numbers later)
-- ---------------------------------------------------------------------------

create table public.organization_counters (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  next_value bigint not null,
  primary key (organization_id, name)
);
alter table public.organization_counters enable row level security;
revoke all on public.organization_counters from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Loads
-- ---------------------------------------------------------------------------

create table public.loads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  load_number text not null check (length(btrim(load_number)) between 1 and 30),
  customer_id uuid not null,
  customer_reference text check (length(customer_reference) <= 100),
  status public.load_status not null default 'planned',
  truck_id uuid,
  trailer_id uuid,
  linehaul_cents bigint not null default 0 check (linehaul_cents >= 0),
  fuel_surcharge_cents bigint not null default 0 check (fuel_surcharge_cents >= 0),
  loaded_miles numeric(10, 1) check (loaded_miles >= 0),
  deadhead_miles numeric(10, 1) not null default 0 check (deadhead_miles >= 0),
  commodity text check (length(commodity) <= 200),
  weight_lbs int check (weight_lbs between 0 and 200000),
  equipment_type public.trailer_type,
  delivered_at timestamptz,
  cancelled_reason text check (length(cancelled_reason) <= 1000),
  is_tonu boolean not null default false,
  notes text check (length(notes) <= 5000),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, customer_id) references public.customers (organization_id, id),
  foreign key (organization_id, truck_id) references public.trucks (organization_id, id),
  foreign key (organization_id, trailer_id) references public.trailers (organization_id, id),
  constraint loads_delivered_requirements check (
    status not in ('delivered', 'invoiced', 'paid')
    or (delivered_at is not null and loaded_miles is not null and loaded_miles > 0)
  ),
  constraint loads_cancelled_reason check (
    status <> 'cancelled' or coalesce(length(btrim(cancelled_reason)), 0) > 0
  )
);

create unique index loads_number_uniq on public.loads (organization_id, lower(load_number));
create index loads_org_status_idx on public.loads (organization_id, status);
create index loads_org_delivered_idx on public.loads (organization_id, delivered_at);
create index loads_customer_idx on public.loads (customer_id);
create index loads_truck_idx on public.loads (truck_id) where truck_id is not null;
create index loads_trailer_idx on public.loads (trailer_id) where trailer_id is not null;

create table public.load_stops (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  load_id uuid not null,
  sequence int not null check (sequence between 1 and 50),
  stop_type public.stop_type not null,
  facility_name text check (length(facility_name) <= 200),
  address_line1 text check (length(address_line1) <= 200),
  city text not null check (length(btrim(city)) between 1 and 100),
  state char(2) not null check (state ~ '^[A-Z]{2}$'),
  zip text check (zip ~ '^[0-9]{5}(-[0-9]{4})?$'),
  timezone text not null,
  appointment_start timestamptz,
  appointment_end timestamptz,
  arrived_at timestamptz,
  departed_at timestamptz,
  notes text check (length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id, load_id) references public.loads (organization_id, id) on delete cascade,
  unique (load_id, sequence) deferrable initially deferred,
  constraint load_stops_window check (appointment_end is null or appointment_start is null or appointment_end >= appointment_start),
  constraint load_stops_actuals check (departed_at is null or arrived_at is null or departed_at >= arrived_at)
);
create index load_stops_org_idx on public.load_stops (organization_id);
create index load_stops_load_idx on public.load_stops (load_id, sequence);

create table public.load_drivers (
  organization_id uuid not null references public.organizations (id),
  load_id uuid not null,
  driver_id uuid not null,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (load_id, driver_id),
  foreign key (organization_id, load_id) references public.loads (organization_id, id) on delete cascade,
  foreign key (organization_id, driver_id) references public.drivers (organization_id, id)
);
create unique index load_drivers_one_primary on public.load_drivers (load_id) where is_primary;
create index load_drivers_org_idx on public.load_drivers (organization_id);
create index load_drivers_driver_idx on public.load_drivers (driver_id);

create table public.load_accessorials (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  load_id uuid not null,
  type public.accessorial_type not null,
  amount_cents bigint not null check (amount_cents > 0),
  billable_to_customer boolean not null default true,
  notes text check (length(notes) <= 500),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  foreign key (organization_id, load_id) references public.loads (organization_id, id)
);
create index load_accessorials_org_idx on public.load_accessorials (organization_id);
create index load_accessorials_load_idx on public.load_accessorials (load_id);

create table public.load_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  load_id uuid not null,
  kind public.load_event_kind not null default 'status_change',
  from_status public.load_status,
  to_status public.load_status,
  reason text check (length(reason) <= 1000),
  created_by uuid default auth.uid(), -- history: no FK, survives user deletion
  created_at timestamptz not null default now(),
  foreign key (organization_id, load_id) references public.loads (organization_id, id)
);
create index load_events_org_idx on public.load_events (organization_id);
create index load_events_load_idx on public.load_events (load_id, created_at);

-- ---------------------------------------------------------------------------
-- Load numbers
-- ---------------------------------------------------------------------------

create or replace function public.next_load_number(p_org uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_next bigint;
begin
  loop
    insert into public.organization_counters (organization_id, name, next_value)
    values (p_org, 'load_number', 1002)
    on conflict (organization_id, name) do update set next_value = public.organization_counters.next_value + 1
    returning next_value - 1 into v_next;
    -- skip numbers someone typed in by hand
    exit when not exists (
      select 1 from public.loads where organization_id = p_org and lower(load_number) = v_next::text
    );
  end loop;
  return v_next::text;
end;
$$;
revoke execute on function public.next_load_number(uuid) from public, anon, authenticated;

create or replace function public.loads_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.load_number is null or btrim(new.load_number) = '' then
    new.load_number := public.next_load_number(new.organization_id);
  else
    new.load_number := btrim(new.load_number);
  end if;
  return new;
end;
$$;
revoke execute on function public.loads_before_insert() from public, anon, authenticated;

create trigger loads_before_insert before insert on public.loads
  for each row execute function public.loads_before_insert();
create trigger loads_set_updated_at before update on public.loads
  for each row execute function public.set_updated_at();
create trigger load_stops_set_updated_at before update on public.load_stops
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Assignment rules (open loads only: history keeps whatever was true then)
-- ---------------------------------------------------------------------------

create or replace function public.load_is_open(s public.load_status)
returns boolean language sql immutable as $$
  select s in ('planned', 'dispatched', 'at_pickup', 'in_transit');
$$;

create or replace function public.loads_check_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_archived timestamptz;
begin
  if not public.load_is_open(new.status) then
    return new;
  end if;

  if tg_op = 'INSERT' or new.customer_id is distinct from old.customer_id then
    select status, archived_at into v_status, v_archived from public.customers
    where id = new.customer_id and organization_id = new.organization_id;
    if v_status = 'do_not_use' then
      raise exception 'This customer is marked do not use' using errcode = 'P0001', hint = 'customer_do_not_use';
    elsif v_archived is not null then
      raise exception 'This customer is archived' using errcode = 'P0001', hint = 'customer_archived';
    end if;
  end if;

  if new.truck_id is not null and (tg_op = 'INSERT' or new.truck_id is distinct from old.truck_id) then
    select status, archived_at into v_status, v_archived from public.trucks
    where id = new.truck_id and organization_id = new.organization_id;
    if v_status = 'sold' or v_archived is not null then
      raise exception 'This truck is sold or archived' using errcode = 'P0001', hint = 'truck_unavailable';
    end if;
  end if;

  if new.trailer_id is not null and (tg_op = 'INSERT' or new.trailer_id is distinct from old.trailer_id) then
    select status, archived_at into v_status, v_archived from public.trailers
    where id = new.trailer_id and organization_id = new.organization_id;
    if v_status = 'sold' or v_archived is not null then
      raise exception 'This trailer is sold or archived' using errcode = 'P0001', hint = 'trailer_unavailable';
    end if;
  end if;

  return new;
end;
$$;
revoke execute on function public.loads_check_assignment() from public, anon, authenticated;

create trigger loads_check_assignment before insert or update on public.loads
  for each row execute function public.loads_check_assignment();

create or replace function public.load_drivers_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_driver record;
  v_load_status public.load_status;
  v_today date := public.org_today(new.organization_id);
begin
  select status into v_load_status from public.loads where id = new.load_id and organization_id = new.organization_id;
  if (select count(*) from public.load_drivers where load_id = new.load_id and driver_id <> new.driver_id) >= 2 then
    raise exception 'A load can have at most two drivers' using errcode = 'P0001', hint = 'too_many_drivers';
  end if;
  if not public.load_is_open(v_load_status) then
    return new;
  end if;

  select status, archived_at, cdl_expires_on, medical_card_expires_on into v_driver
  from public.drivers where id = new.driver_id and organization_id = new.organization_id;
  if v_driver.archived_at is not null or v_driver.status <> 'active' then
    raise exception 'This driver is not active' using errcode = 'P0001', hint = 'driver_inactive';
  end if;
  if v_driver.cdl_expires_on < v_today or v_driver.medical_card_expires_on < v_today then
    raise exception 'This driver''s CDL or medical card has expired' using errcode = 'P0001', hint = 'driver_expired';
  end if;
  return new;
end;
$$;
revoke execute on function public.load_drivers_check() from public, anon, authenticated;

create trigger load_drivers_check before insert or update on public.load_drivers
  for each row execute function public.load_drivers_check();

-- New loads start their history.
create or replace function public.loads_log_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.load_events (organization_id, load_id, kind, from_status, to_status, created_by)
  values (new.organization_id, new.id, 'status_change', null, new.status, coalesce((select auth.uid()), new.created_by));
  return new;
end;
$$;
revoke execute on function public.loads_log_created() from public, anon, authenticated;

create trigger loads_log_created after insert on public.loads
  for each row execute function public.loads_log_created();

-- load_events is insert-only.
create or replace function public.load_events_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'load_events is insert-only' using errcode = '42501';
end;
$$;
create trigger load_events_no_update_delete before update or delete on public.load_events
  for each row execute function public.load_events_immutable();

-- ---------------------------------------------------------------------------
-- Status changes
-- ---------------------------------------------------------------------------

create or replace function public.load_status_rank(s public.load_status)
returns int language sql immutable as $$
  select case s
    when 'planned' then 1 when 'dispatched' then 2 when 'at_pickup' then 3 when 'in_transit' then 4
    when 'delivered' then 5 when 'invoiced' then 6 when 'paid' then 7 else 0 end;
$$;

create or replace function public.change_load_status(
  p_load uuid,
  p_to public.load_status,
  p_reason text default null,
  p_delivered_at timestamptz default null,
  p_loaded_miles numeric default null,
  p_deadhead_miles numeric default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_load public.loads;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_backward boolean;
begin
  select * into v_load from public.loads where id = p_load for update;
  if v_load.id is null
     or not public.has_org_role(v_load.organization_id, array['owner', 'admin', 'dispatcher']::public.org_role[]) then
    raise exception 'Load not found' using errcode = '42501';
  end if;
  if p_to = v_load.status then
    return;
  end if;
  if p_to in ('invoiced', 'paid') or v_load.status in ('invoiced', 'paid') then
    raise exception 'Invoicing is not available yet' using errcode = 'P0001', hint = 'invoicing_not_built';
  end if;

  v_backward := v_load.status = 'cancelled'
    or (p_to <> 'cancelled' and public.load_status_rank(p_to) < public.load_status_rank(v_load.status));

  if p_to = 'cancelled' and v_load.status = 'delivered' then
    raise exception 'A delivered load can''t be cancelled; move it back first' using errcode = 'P0001', hint = 'cancel_delivered';
  end if;
  if (p_to = 'cancelled' or v_backward) and v_reason is null then
    raise exception 'A reason is required' using errcode = 'P0001', hint = 'reason_required';
  end if;

  if p_to <> 'cancelled' and public.load_status_rank(p_to) >= 2 then
    if v_load.truck_id is null
       or not exists (select 1 from public.load_drivers where load_id = p_load)
       or not exists (select 1 from public.load_stops where load_id = p_load and stop_type = 'pickup')
       or not exists (select 1 from public.load_stops where load_id = p_load and stop_type = 'delivery') then
      raise exception 'Assign a truck and a driver and add a pickup and a delivery first'
        using errcode = 'P0001', hint = 'not_ready_to_dispatch';
    end if;
  end if;

  update public.loads set
    status = p_to,
    loaded_miles = case when p_to = 'delivered' then coalesce(p_loaded_miles, loaded_miles) else loaded_miles end,
    deadhead_miles = case when p_to = 'delivered' then coalesce(p_deadhead_miles, deadhead_miles) else deadhead_miles end,
    delivered_at = case
      when p_to = 'delivered' then coalesce(p_delivered_at, delivered_at)
      when public.load_status_rank(p_to) < 5 then null
      else delivered_at end,
    cancelled_reason = case when p_to = 'cancelled' then v_reason else null end
  where id = p_load;

  insert into public.load_events (organization_id, load_id, kind, from_status, to_status, reason)
  values (v_load.organization_id, p_load, 'status_change', v_load.status, p_to, v_reason);
exception
  when check_violation then
    if p_to = 'delivered' then
      raise exception 'Delivered needs the delivery time and loaded miles' using errcode = 'P0001', hint = 'delivery_details_required';
    end if;
    raise;
end;
$$;
revoke execute on function public.change_load_status(uuid, public.load_status, text, timestamptz, numeric, numeric) from public, anon;
grant execute on function public.change_load_status(uuid, public.load_status, text, timestamptz, numeric, numeric) to authenticated;

-- Owner/admin override of the overlapping-assignment warning, recorded on the load.
create or replace function public.record_load_override(p_load uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  select organization_id into v_org from public.loads where id = p_load;
  if v_org is null or not public.has_org_role(v_org, array['owner', 'admin']::public.org_role[]) then
    raise exception 'Only an owner or admin can override this warning' using errcode = '42501';
  end if;
  if coalesce(length(btrim(p_reason)), 0) = 0 then
    raise exception 'A reason is required' using errcode = 'P0001', hint = 'reason_required';
  end if;
  insert into public.load_events (organization_id, load_id, kind, reason)
  values (v_org, p_load, 'assignment_override', btrim(p_reason));
end;
$$;
revoke execute on function public.record_load_override(uuid, text) from public, anon;
grant execute on function public.record_load_override(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Save a load with its stops and drivers in one transaction (runs as the caller: RLS applies)
-- ---------------------------------------------------------------------------

create or replace function public.save_load(p_load jsonb, p_stops jsonb, p_driver_ids uuid[])
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid := nullif(p_load ->> 'id', '')::uuid;
  v_org uuid := (p_load ->> 'organization_id')::uuid;
  v_stop jsonb;
  v_seq int := 0;
  v_driver uuid;
  v_first boolean := true;
begin
  if v_id is null then
    insert into public.loads (
      organization_id, load_number, customer_id, customer_reference, truck_id, trailer_id,
      linehaul_cents, fuel_surcharge_cents, loaded_miles, deadhead_miles, commodity, weight_lbs,
      equipment_type, is_tonu, notes)
    values (
      v_org, nullif(p_load ->> 'load_number', ''), (p_load ->> 'customer_id')::uuid, p_load ->> 'customer_reference',
      nullif(p_load ->> 'truck_id', '')::uuid, nullif(p_load ->> 'trailer_id', '')::uuid,
      coalesce((p_load ->> 'linehaul_cents')::bigint, 0), coalesce((p_load ->> 'fuel_surcharge_cents')::bigint, 0),
      (p_load ->> 'loaded_miles')::numeric, coalesce((p_load ->> 'deadhead_miles')::numeric, 0),
      p_load ->> 'commodity', (p_load ->> 'weight_lbs')::int,
      nullif(p_load ->> 'equipment_type', '')::public.trailer_type, coalesce((p_load ->> 'is_tonu')::boolean, false),
      p_load ->> 'notes')
    returning id into v_id;
  else
    update public.loads set
      load_number = coalesce(nullif(btrim(p_load ->> 'load_number'), ''), load_number),
      customer_id = (p_load ->> 'customer_id')::uuid,
      customer_reference = p_load ->> 'customer_reference',
      truck_id = nullif(p_load ->> 'truck_id', '')::uuid,
      trailer_id = nullif(p_load ->> 'trailer_id', '')::uuid,
      linehaul_cents = coalesce((p_load ->> 'linehaul_cents')::bigint, 0),
      fuel_surcharge_cents = coalesce((p_load ->> 'fuel_surcharge_cents')::bigint, 0),
      loaded_miles = (p_load ->> 'loaded_miles')::numeric,
      deadhead_miles = coalesce((p_load ->> 'deadhead_miles')::numeric, 0),
      commodity = p_load ->> 'commodity',
      weight_lbs = (p_load ->> 'weight_lbs')::int,
      equipment_type = nullif(p_load ->> 'equipment_type', '')::public.trailer_type,
      is_tonu = coalesce((p_load ->> 'is_tonu')::boolean, false),
      notes = p_load ->> 'notes'
    where id = v_id and organization_id = v_org;
    if not found then
      raise exception 'Load not found' using errcode = '42501';
    end if;
    delete from public.load_stops where load_id = v_id;
  end if;

  for v_stop in select * from jsonb_array_elements(coalesce(p_stops, '[]'::jsonb)) loop
    v_seq := v_seq + 1;
    insert into public.load_stops (
      organization_id, load_id, sequence, stop_type, facility_name, address_line1, city, state, zip,
      timezone, appointment_start, appointment_end, notes)
    values (
      v_org, v_id, v_seq, (v_stop ->> 'stop_type')::public.stop_type, v_stop ->> 'facility_name',
      v_stop ->> 'address_line1', v_stop ->> 'city', v_stop ->> 'state', v_stop ->> 'zip', v_stop ->> 'timezone',
      (v_stop ->> 'appointment_start')::timestamptz, (v_stop ->> 'appointment_end')::timestamptz, v_stop ->> 'notes');
  end loop;

  delete from public.load_drivers
  where load_id = v_id and not (driver_id = any (coalesce(p_driver_ids, '{}'::uuid[])));
  update public.load_drivers set is_primary = false where load_id = v_id;
  foreach v_driver in array coalesce(p_driver_ids, '{}'::uuid[]) loop
    insert into public.load_drivers (organization_id, load_id, driver_id, is_primary)
    values (v_org, v_id, v_driver, v_first)
    on conflict (load_id, driver_id) do update set is_primary = excluded.is_primary;
    v_first := false;
  end loop;

  return v_id;
end;
$$;
revoke execute on function public.save_load(jsonb, jsonb, uuid[]) from public, anon;
grant execute on function public.save_load(jsonb, jsonb, uuid[]) to authenticated;

-- Stop time zones must be real IANA names.
create or replace function public.load_stops_check_timezone()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'Unknown time zone: %', new.timezone using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger load_stops_check_timezone before insert or update of timezone on public.load_stops
  for each row execute function public.load_stops_check_timezone();

-- ---------------------------------------------------------------------------
-- Audit
-- ---------------------------------------------------------------------------

create trigger audit_loads after insert or update on public.loads
  for each row execute function public.audit_trigger();
create trigger audit_load_stops after insert or update or delete on public.load_stops
  for each row execute function public.audit_trigger();
create trigger audit_load_drivers after insert or update or delete on public.load_drivers
  for each row execute function public.audit_trigger();
create trigger audit_load_accessorials after insert or update or delete on public.load_accessorials
  for each row execute function public.audit_trigger();

-- ---------------------------------------------------------------------------
-- Row Level Security (DATABASE_SCHEMA.md §5: Loads, stops)
-- ---------------------------------------------------------------------------

alter table public.loads enable row level security;
alter table public.load_stops enable row level security;
alter table public.load_drivers enable row level security;
alter table public.load_accessorials enable row level security;
alter table public.load_events enable row level security;

create policy "members read" on public.loads
  for select to authenticated using (public.is_org_member(organization_id));
create policy "dispatch insert" on public.loads
  for insert to authenticated
  with check (public.has_org_role(organization_id, array['owner', 'admin', 'dispatcher']::public.org_role[]));
create policy "dispatch update" on public.loads
  for update to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin', 'dispatcher']::public.org_role[]))
  with check (public.has_org_role(organization_id, array['owner', 'admin', 'dispatcher']::public.org_role[]));

-- Child tables: same rule, and only while the load hasn't been invoiced.
create or replace function public.can_edit_load(p_load uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.loads l
    where l.id = p_load
      and l.status not in ('invoiced', 'paid')
      and public.has_org_role(l.organization_id, array['owner', 'admin', 'dispatcher']::public.org_role[])
  );
$$;
revoke execute on function public.can_edit_load(uuid) from public, anon;
grant execute on function public.can_edit_load(uuid) to authenticated;

create policy "members read" on public.load_stops
  for select to authenticated using (public.is_org_member(organization_id));
create policy "dispatch write" on public.load_stops
  for all to authenticated
  using (public.can_edit_load(load_id)) with check (public.can_edit_load(load_id));

create policy "members read" on public.load_drivers
  for select to authenticated using (public.is_org_member(organization_id));
create policy "dispatch write" on public.load_drivers
  for all to authenticated
  using (public.can_edit_load(load_id)) with check (public.can_edit_load(load_id));

create policy "members read" on public.load_accessorials
  for select to authenticated using (public.is_org_member(organization_id));
create policy "dispatch write" on public.load_accessorials
  for all to authenticated
  using (public.can_edit_load(load_id)) with check (public.can_edit_load(load_id));

create policy "members read" on public.load_events
  for select to authenticated using (public.is_org_member(organization_id));

-- ---------------------------------------------------------------------------
-- Privileges: status, delivery and cancellation only through change_load_status()
-- ---------------------------------------------------------------------------

revoke all on public.loads, public.load_stops, public.load_drivers, public.load_accessorials, public.load_events from anon;

revoke update, delete, truncate on public.loads from authenticated;
grant update (load_number, customer_id, customer_reference, truck_id, trailer_id, linehaul_cents,
  fuel_surcharge_cents, loaded_miles, deadhead_miles, commodity, weight_lbs, equipment_type, is_tonu, notes)
  on public.loads to authenticated;

revoke truncate on public.load_stops, public.load_drivers, public.load_accessorials from authenticated;
revoke update on public.load_accessorials from authenticated;
revoke insert, update, delete, truncate on public.load_events from authenticated;

-- New loads always start as planned: status/delivery/cancellation can't be inserted directly.
revoke insert on public.loads from authenticated;
grant insert (organization_id, load_number, customer_id, customer_reference, truck_id, trailer_id,
  linehaul_cents, fuel_surcharge_cents, loaded_miles, deadhead_miles, commodity, weight_lbs,
  equipment_type, is_tonu, notes) on public.loads to authenticated;
