-- 0003_fleet
-- Trucks, trailers and odometer / hubodometer / reefer-hour readings.
--
-- Business rules (docs/PRODUCT_SPEC.md §4.5, §4.6 and decisions of 11/09/2026):
--   * Unit numbers are unique per organization among non-archived assets,
--     separately for trucks and trailers (truck 101 and trailer 101 may coexist).
--   * Assets are never deleted, only archived.
--   * Owner/admin/maintenance edit assets; a dispatcher may change status only;
--     only an owner/admin may mark an asset sold or un-sell it.
--   * A sold asset is read-only (except archiving and un-selling by owner/admin).
--   * Meter readings only go up. A lower reading is a correction: owner/admin
--     only, with a reason, recorded in odometer_readings and audit_logs.
--   * The current meter values on an asset are maintained from odometer_readings;
--     users cannot write them directly after the asset is created.

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

create type public.ownership_type as enum ('owned', 'financed', 'leased');
create type public.asset_status as enum ('active', 'in_shop', 'out_of_service', 'sold');
create type public.trailer_type as enum ('dry_van', 'reefer', 'flatbed', 'step_deck', 'other');
create type public.asset_type as enum ('truck', 'trailer');
create type public.meter_type as enum ('odometer', 'hubodometer', 'reefer_hours');
create type public.meter_source as enum ('manual', 'fuel', 'work_order', 'load');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.trucks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  unit_number text not null check (length(btrim(unit_number)) between 1 and 20),
  vin text not null check (vin ~ '^[A-HJ-NPR-Z0-9]{17}$'),
  year int check (year between 1950 and 2100),
  make text check (length(make) <= 50),
  model text check (length(model) <= 50),
  plate text check (length(plate) <= 15),
  plate_state char(2) check (plate_state ~ '^[A-Z]{2}$'),
  ownership public.ownership_type not null default 'owned',
  purchase_date date,
  purchase_price_cents bigint check (purchase_price_cents >= 0),
  current_odometer numeric(10, 1) check (current_odometer >= 0),
  status public.asset_status not null default 'active',
  registration_expires_on date,
  -- date of the last periodic (DOT) inspection; the next one is due
  -- annual_inspection_valid_months later (entered by the user: 3, 6, 9 or 12)
  annual_inspection_on date,
  annual_inspection_valid_months smallint not null default 12
    check (annual_inspection_valid_months in (3, 6, 9, 12)),
  insurance_expires_on date,
  notes text check (length(notes) <= 5000),
  archived_at timestamptz,
  archived_by uuid references auth.users (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id)
);

create unique index trucks_unit_number_uniq on public.trucks (organization_id, lower(unit_number))
  where archived_at is null;
create unique index trucks_vin_uniq on public.trucks (organization_id, vin) where archived_at is null;
create index trucks_org_status_idx on public.trucks (organization_id, status);

create table public.trailers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  unit_number text not null check (length(btrim(unit_number)) between 1 and 20),
  vin text check (vin ~ '^[A-HJ-NPR-Z0-9]{17}$'),
  year int check (year between 1950 and 2100),
  make text check (length(make) <= 50),
  trailer_type public.trailer_type not null,
  length_ft int check (length_ft between 10 and 65),
  plate text check (length(plate) <= 15),
  plate_state char(2) check (plate_state ~ '^[A-Z]{2}$'),
  ownership public.ownership_type not null default 'owned',
  purchase_date date,
  purchase_price_cents bigint check (purchase_price_cents >= 0),
  hubodometer numeric(10, 1) check (hubodometer >= 0),
  reefer_hours numeric(10, 1) check (reefer_hours >= 0),
  status public.asset_status not null default 'active',
  registration_expires_on date,
  annual_inspection_on date,
  annual_inspection_valid_months smallint not null default 12
    check (annual_inspection_valid_months in (3, 6, 9, 12)),
  notes text check (length(notes) <= 5000),
  archived_at timestamptz,
  archived_by uuid references auth.users (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  constraint trailers_reefer_hours_only_reefer check (reefer_hours is null or trailer_type = 'reefer')
);

create unique index trailers_unit_number_uniq on public.trailers (organization_id, lower(unit_number))
  where archived_at is null;
create unique index trailers_vin_uniq on public.trailers (organization_id, vin)
  where archived_at is null and vin is not null;
create index trailers_org_status_idx on public.trailers (organization_id, status);

create table public.odometer_readings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  asset_type public.asset_type not null,
  truck_id uuid,
  trailer_id uuid,
  reading numeric(10, 1) not null check (reading >= 0),
  reading_type public.meter_type not null,
  read_on date not null default current_date,
  source public.meter_source not null default 'manual',
  is_correction boolean not null default false,
  note text check (length(note) <= 500),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  -- composite keys: a reading can only point at an asset of its own organization
  foreign key (organization_id, truck_id) references public.trucks (organization_id, id),
  foreign key (organization_id, trailer_id) references public.trailers (organization_id, id),
  constraint odometer_readings_asset_check check (
    (asset_type = 'truck' and truck_id is not null and trailer_id is null and reading_type = 'odometer')
    or (asset_type = 'trailer' and trailer_id is not null and truck_id is null
        and reading_type in ('hubodometer', 'reefer_hours'))
  ),
  constraint odometer_readings_correction_note check (not is_correction or coalesce(length(btrim(note)), 0) > 0)
);

create index odometer_readings_org_idx on public.odometer_readings (organization_id);
create index odometer_readings_truck_idx on public.odometer_readings (truck_id, read_on desc) where truck_id is not null;
create index odometer_readings_trailer_idx on public.odometer_readings (trailer_id, read_on desc) where trailer_id is not null;

-- ---------------------------------------------------------------------------
-- Guards on trucks / trailers updates
-- ---------------------------------------------------------------------------

create or replace function public.fleet_asset_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  -- columns maintained by the system or by the archive action
  v_system text[] := array['updated_at', 'archived_at', 'archived_by', 'current_odometer', 'hubodometer', 'reefer_hours'];
  v_old jsonb := to_jsonb(old);
  v_new jsonb := to_jsonb(new);
  v_col text;
  v_meter text;
begin
  -- Dispatchers (the only other role RLS lets through) may change status only.
  if v_actor is not null
     and not public.has_org_role(old.organization_id, array['owner', 'admin', 'maintenance']::public.org_role[])
     and (v_new - 'status' - 'updated_at') <> (v_old - 'status' - 'updated_at') then
    raise exception 'Dispatchers can only change the status' using errcode = '42501';
  end if;

  -- Selling and un-selling is an owner/admin decision.
  if (old.status = 'sold') <> (new.status = 'sold')
     and v_actor is not null
     and not public.has_org_role(old.organization_id, array['owner', 'admin']::public.org_role[]) then
    raise exception 'Only an owner or admin can change a sold status' using errcode = '42501', hint = 'sold_status';
  end if;

  -- A sold asset is read-only.
  if old.status = 'sold' and new.status = 'sold' then
    foreach v_col in array v_system loop
      v_old := v_old - v_col;
      v_new := v_new - v_col;
    end loop;
    if v_new <> v_old then
      raise exception 'A sold asset is read-only' using errcode = 'P0001', hint = 'sold_read_only';
    end if;
  end if;

  -- Meters only go up, unless a correction is being applied by record_meter_reading.
  foreach v_meter in array array['current_odometer', 'hubodometer', 'reefer_hours'] loop
    if (to_jsonb(new) ->> v_meter)::numeric < (to_jsonb(old) ->> v_meter)::numeric
       and coalesce(current_setting('fmp.meter_correction', true), '') <> 'on' then
      raise exception 'Meter readings can only increase' using errcode = 'P0001', hint = 'meter_decrease';
    end if;
  end loop;

  -- Who archived it.
  if old.archived_at is null and new.archived_at is not null then
    new.archived_by := v_actor;
  elsif new.archived_at is null then
    new.archived_by := null;
  end if;

  return new;
end;
$$;

create trigger trucks_guard before update on public.trucks
  for each row execute function public.fleet_asset_guard();
create trigger trailers_guard before update on public.trailers
  for each row execute function public.fleet_asset_guard();

create trigger trucks_set_updated_at before update on public.trucks
  for each row execute function public.set_updated_at();
create trigger trailers_set_updated_at before update on public.trailers
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Meter readings: validate, then roll the value up to the asset
-- ---------------------------------------------------------------------------

create or replace function public.odometer_readings_validate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_current numeric;
  v_status public.asset_status;
  v_archived timestamptz;
  v_trailer_type public.trailer_type;
begin
  -- Check access first: this function bypasses RLS, and BEFORE triggers run before
  -- the policy's WITH CHECK, so nothing about another tenant's asset may be read or reported.
  if v_actor is not null
     and not public.has_org_role(new.organization_id, array['owner', 'admin', 'maintenance']::public.org_role[]) then
    raise exception 'You don''t have permission to record readings' using errcode = '42501';
  end if;

  if new.asset_type = 'truck' then
    select current_odometer, status, archived_at into v_current, v_status, v_archived
    from public.trucks where id = new.truck_id and organization_id = new.organization_id
    for update;
  else
    select case new.reading_type when 'hubodometer' then hubodometer else reefer_hours end,
           status, archived_at, trailer_type
      into v_current, v_status, v_archived, v_trailer_type
    from public.trailers where id = new.trailer_id and organization_id = new.organization_id
    for update;
    if new.reading_type = 'reefer_hours' and v_trailer_type <> 'reefer' then
      raise exception 'Reefer hours can only be recorded for reefer trailers' using errcode = '23514';
    end if;
  end if;

  if v_status = 'sold' then
    raise exception 'A sold asset is read-only' using errcode = 'P0001', hint = 'sold_read_only';
  end if;
  if v_archived is not null then
    raise exception 'Archived assets cannot get new readings' using errcode = 'P0001', hint = 'archived';
  end if;

  if new.is_correction then
    if v_actor is not null
       and not public.has_org_role(new.organization_id, array['owner', 'admin']::public.org_role[]) then
      raise exception 'Only an owner or admin can correct a reading' using errcode = '42501', hint = 'meter_correction';
    end if;
  elsif v_current is not null and new.reading < v_current then
    raise exception 'Reading % is lower than the current % of %', new.reading, new.reading_type, v_current
      using errcode = 'P0001', hint = 'meter_decrease';
  end if;

  new.created_by := coalesce(v_actor, new.created_by);
  return new;
end;
$$;

create or replace function public.odometer_readings_apply()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_correction then
    perform set_config('fmp.meter_correction', 'on', true);
  end if;

  -- Only touch the asset when the value actually changes (keeps audit_logs free of no-op updates).
  if new.asset_type = 'truck' then
    update public.trucks t
      set current_odometer = v.value
      from (select case when new.is_correction then new.reading
                        else greatest(coalesce(current_odometer, 0), new.reading) end as value
            from public.trucks where id = new.truck_id) v
      where t.id = new.truck_id and t.organization_id = new.organization_id
        and t.current_odometer is distinct from v.value;
  elsif new.reading_type = 'hubodometer' then
    update public.trailers t
      set hubodometer = v.value
      from (select case when new.is_correction then new.reading
                        else greatest(coalesce(hubodometer, 0), new.reading) end as value
            from public.trailers where id = new.trailer_id) v
      where t.id = new.trailer_id and t.organization_id = new.organization_id
        and t.hubodometer is distinct from v.value;
  else
    update public.trailers t
      set reefer_hours = v.value
      from (select case when new.is_correction then new.reading
                        else greatest(coalesce(reefer_hours, 0), new.reading) end as value
            from public.trailers where id = new.trailer_id) v
      where t.id = new.trailer_id and t.organization_id = new.organization_id
        and t.reefer_hours is distinct from v.value;
  end if;

  perform set_config('fmp.meter_correction', 'off', true);
  return new;
end;
$$;

create trigger odometer_readings_validate before insert on public.odometer_readings
  for each row execute function public.odometer_readings_validate();
create trigger odometer_readings_apply after insert on public.odometer_readings
  for each row execute function public.odometer_readings_apply();

-- The starting meter value entered when an asset is created becomes its first reading.
create or replace function public.fleet_initial_readings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb := to_jsonb(new);
  v_meter public.meter_type;
  v_column text;
begin
  foreach v_column in array case when tg_table_name = 'trucks' then array['current_odometer']
                                 else array['hubodometer', 'reefer_hours'] end loop
    if v_row ->> v_column is not null then
      v_meter := case v_column when 'current_odometer' then 'odometer' else v_column end::public.meter_type;
      insert into public.odometer_readings
        (organization_id, asset_type, truck_id, trailer_id, reading, reading_type, note, created_by)
      values (
        new.organization_id,
        case when tg_table_name = 'trucks' then 'truck' else 'trailer' end::public.asset_type,
        case when tg_table_name = 'trucks' then new.id end,
        case when tg_table_name = 'trailers' then new.id end,
        (v_row ->> v_column)::numeric,
        v_meter,
        'Initial reading',
        (v_row ->> 'created_by')::uuid
      );
    end if;
  end loop;
  return new;
end;
$$;

create trigger trucks_initial_reading after insert on public.trucks
  for each row execute function public.fleet_initial_readings();
create trigger trailers_initial_reading after insert on public.trailers
  for each row execute function public.fleet_initial_readings();

revoke execute on function public.odometer_readings_validate() from public, anon, authenticated;
revoke execute on function public.odometer_readings_apply() from public, anon, authenticated;
revoke execute on function public.fleet_initial_readings() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Audit
-- ---------------------------------------------------------------------------

create trigger audit_trucks after insert or update on public.trucks
  for each row execute function public.audit_trigger();
create trigger audit_trailers after insert or update on public.trailers
  for each row execute function public.audit_trigger();
create trigger audit_odometer_readings after insert on public.odometer_readings
  for each row execute function public.audit_trigger();

-- ---------------------------------------------------------------------------
-- Row Level Security (DATABASE_SCHEMA.md §5: trucks, trailers)
-- ---------------------------------------------------------------------------

alter table public.trucks enable row level security;
alter table public.trailers enable row level security;
alter table public.odometer_readings enable row level security;

create policy "members read" on public.trucks
  for select to authenticated using (public.is_org_member(organization_id));
create policy "editors insert" on public.trucks
  for insert to authenticated
  with check (public.has_org_role(organization_id, array['owner', 'admin', 'maintenance']::public.org_role[]));
create policy "editors and dispatch update" on public.trucks
  for update to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin', 'maintenance', 'dispatcher']::public.org_role[]))
  with check (public.has_org_role(organization_id, array['owner', 'admin', 'maintenance', 'dispatcher']::public.org_role[]));

create policy "members read" on public.trailers
  for select to authenticated using (public.is_org_member(organization_id));
create policy "editors insert" on public.trailers
  for insert to authenticated
  with check (public.has_org_role(organization_id, array['owner', 'admin', 'maintenance']::public.org_role[]));
create policy "editors and dispatch update" on public.trailers
  for update to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin', 'maintenance', 'dispatcher']::public.org_role[]))
  with check (public.has_org_role(organization_id, array['owner', 'admin', 'maintenance', 'dispatcher']::public.org_role[]));

create policy "members read" on public.odometer_readings
  for select to authenticated using (public.is_org_member(organization_id));
create policy "editors insert" on public.odometer_readings
  for insert to authenticated
  with check (public.has_org_role(organization_id, array['owner', 'admin', 'maintenance']::public.org_role[]));

-- ---------------------------------------------------------------------------
-- Privileges: no deletes; meters and ownership columns are not user-updatable
-- ---------------------------------------------------------------------------

revoke all on public.trucks, public.trailers, public.odometer_readings from anon;

revoke update, delete, truncate on public.trucks from authenticated;
grant update (unit_number, vin, year, make, model, plate, plate_state, ownership, purchase_date,
  purchase_price_cents, status, registration_expires_on, annual_inspection_on, annual_inspection_valid_months,
  insurance_expires_on, notes, archived_at) on public.trucks to authenticated;

revoke update, delete, truncate on public.trailers from authenticated;
grant update (unit_number, vin, year, make, trailer_type, length_ft, plate, plate_state, ownership,
  purchase_date, purchase_price_cents, status, registration_expires_on, annual_inspection_on,
  annual_inspection_valid_months, notes, archived_at) on public.trailers to authenticated;

revoke update, delete, truncate on public.odometer_readings from authenticated;
