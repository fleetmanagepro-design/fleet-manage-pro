-- 0004b_assign_load
-- Assign a truck, trailer and drivers to a load from the dispatch board without
-- re-saving its stops. Runs as the caller, so RLS and the assignment rules in
-- 0004_loads (sold/archived equipment, inactive/expired drivers, max two drivers) apply.

create or replace function public.assign_load(
  p_load uuid,
  p_truck uuid,
  p_trailer uuid,
  p_driver_ids uuid[]
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_org uuid;
  v_driver uuid;
  v_first boolean := true;
begin
  update public.loads set truck_id = p_truck, trailer_id = p_trailer
  where id = p_load
  returning organization_id into v_org;
  if v_org is null then
    raise exception 'Load not found' using errcode = '42501';
  end if;

  delete from public.load_drivers
  where load_id = p_load and not (driver_id = any (coalesce(p_driver_ids, '{}'::uuid[])));
  update public.load_drivers set is_primary = false where load_id = p_load;
  foreach v_driver in array coalesce(p_driver_ids, '{}'::uuid[]) loop
    insert into public.load_drivers (organization_id, load_id, driver_id, is_primary)
    values (v_org, p_load, v_driver, v_first)
    on conflict (load_id, driver_id) do update set is_primary = excluded.is_primary;
    v_first := false;
  end loop;
end;
$$;
revoke execute on function public.assign_load(uuid, uuid, uuid, uuid[]) from public, anon;
grant execute on function public.assign_load(uuid, uuid, uuid, uuid[]) to authenticated;
