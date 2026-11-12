-- 0004h_pickup_number_auto_load_number
-- Decisions of 11/12/2026:
--   * Each stop can carry its reference number (the pickup number on a pickup stop).
--   * Load numbers are always assigned automatically and never changed afterwards (replaces "automatic,
--     editable" from 0004_loads). Existing numbers stay as they are.

alter table public.load_stops add column reference_number text check (length(btrim(reference_number)) between 1 and 50);

-- Every new load gets the next number, whatever the caller sent.
create or replace function public.loads_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.load_number := public.next_load_number(new.organization_id);
  return new;
end;
$$;

create or replace function public.loads_number_locked()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.load_number is distinct from old.load_number then
    raise exception 'Load numbers are assigned automatically and can''t be changed'
      using errcode = 'P0001', hint = 'load_number_locked';
  end if;
  return new;
end;
$$;
revoke execute on function public.loads_number_locked() from public, anon, authenticated;
create trigger loads_number_locked before update of load_number on public.loads
  for each row execute function public.loads_number_locked();

revoke insert (load_number), update (load_number) on public.loads from authenticated;

-- save_load: no load number from the caller; stops carry their reference number.
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
      organization_id, customer_id, customer_reference, truck_id, trailer_id,
      linehaul_cents, fuel_surcharge_cents, loaded_miles, deadhead_miles, commodity, weight_lbs,
      equipment_type, is_tonu, notes)
    values (
      v_org, (p_load ->> 'customer_id')::uuid, p_load ->> 'customer_reference',
      nullif(p_load ->> 'truck_id', '')::uuid, nullif(p_load ->> 'trailer_id', '')::uuid,
      coalesce((p_load ->> 'linehaul_cents')::bigint, 0), coalesce((p_load ->> 'fuel_surcharge_cents')::bigint, 0),
      (p_load ->> 'loaded_miles')::numeric, coalesce((p_load ->> 'deadhead_miles')::numeric, 0),
      p_load ->> 'commodity', (p_load ->> 'weight_lbs')::int,
      nullif(p_load ->> 'equipment_type', '')::public.trailer_type, coalesce((p_load ->> 'is_tonu')::boolean, false),
      p_load ->> 'notes')
    returning id into v_id;
  else
    update public.loads set
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
      timezone, appointment_start, appointment_end, notes, reference_number)
    values (
      v_org, v_id, v_seq, (v_stop ->> 'stop_type')::public.stop_type, v_stop ->> 'facility_name',
      v_stop ->> 'address_line1', v_stop ->> 'city', v_stop ->> 'state', v_stop ->> 'zip', v_stop ->> 'timezone',
      (v_stop ->> 'appointment_start')::timestamptz, (v_stop ->> 'appointment_end')::timestamptz, v_stop ->> 'notes',
      nullif(btrim(v_stop ->> 'reference_number'), ''));
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
