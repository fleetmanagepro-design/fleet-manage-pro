-- 0004g_facilities
-- Remembered shippers / receivers (decision of 11/11/2026): every stop saved with a facility name is remembered
-- for its organization, so the next load can pick it and fill the whole address. A stop keeps its own copy of
-- the address, so editing a remembered facility never changes past loads.

create table public.facilities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  name text not null check (length(btrim(name)) between 1 and 200),
  address_line1 text check (length(address_line1) <= 200),
  city text not null check (length(btrim(city)) between 1 and 100),
  state char(2) not null check (state ~ '^[A-Z]{2}$'),
  zip text check (zip ~ '^[0-9]{5}(-[0-9]{4})?$'),
  timezone text not null,
  notes text check (length(notes) <= 2000),
  use_count int not null default 0 check (use_count >= 0),
  last_used_at timestamptz,
  archived_at timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id)
);
create index facilities_org_idx on public.facilities (organization_id);
-- One facility per name + street + ZIP in an organization (case-insensitive).
create unique index facilities_identity on public.facilities
  (organization_id, lower(btrim(name)), lower(coalesce(btrim(address_line1), '')), coalesce(zip, ''));

create trigger facilities_set_updated_at before update on public.facilities
  for each row execute function public.set_updated_at();

-- Remember the facility of every saved stop. Runs as definer: the stop itself already passed RLS,
-- and the facility is written into the stop's own organization only.
create or replace function public.remember_stop_facility()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.facility_name is null or length(btrim(new.facility_name)) = 0 then
    return new;
  end if;
  insert into public.facilities (organization_id, name, address_line1, city, state, zip, timezone, use_count, last_used_at, created_by)
  values (new.organization_id, btrim(new.facility_name), nullif(btrim(new.address_line1), ''), btrim(new.city), new.state,
    new.zip, new.timezone, 1, now(), auth.uid())
  on conflict (organization_id, lower(btrim(name)), lower(coalesce(btrim(address_line1), '')), coalesce(zip, ''))
  do update set
    city = excluded.city, state = excluded.state, timezone = excluded.timezone,
    use_count = public.facilities.use_count + 1, last_used_at = now(), archived_at = null;
  return new;
end;
$$;
revoke execute on function public.remember_stop_facility() from public, anon, authenticated;
create trigger load_stops_remember_facility after insert on public.load_stops
  for each row execute function public.remember_stop_facility();

alter table public.facilities enable row level security;
create policy "members read" on public.facilities
  for select to authenticated using (public.is_org_member(organization_id));
create policy "dispatch update" on public.facilities
  for update to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin', 'dispatcher']::public.org_role[]))
  with check (public.has_org_role(organization_id, array['owner', 'admin', 'dispatcher']::public.org_role[]));

revoke all on public.facilities from anon;
revoke insert, update, delete, truncate on public.facilities from authenticated;
-- Facilities are added by saving loads; dispatch can correct or archive them (never deleted).
grant update (name, address_line1, city, state, zip, timezone, notes, archived_at) on public.facilities to authenticated;
