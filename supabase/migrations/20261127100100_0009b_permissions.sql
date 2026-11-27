-- 0009b_permissions
-- Roles become sets of permissions (owner's decision of 11/27/2026, PRODUCT_SPEC.md §4.1):
--   * `permissions` is the fixed catalog of what can be allowed.
--   * `org_roles` are each organization's roles: eight built-in ones (created with the organization)
--     and, later, roles the company makes itself. A role is a name plus a list of permissions.
--   * `member_roles` says which roles a member has; a member can have more than one and gets
--     everything any of them allows.
--   * Owner is special: it allows everything, can't be edited, and the last owner can't be removed.
--   * Nobody can give a permission they don't have themselves, and members/admins can only change
--     members whose permissions they fully have.
-- Every RLS policy and function that used to list roles now asks has_permission(). The built-in
-- roles get exactly the rights the old role lists gave, so nobody's access changes with this migration.
--
-- Transition: the app still sets one role per member in organization_members.role (and invitations.role);
-- a trigger mirrors it into member_roles. The column goes away when the Roles screen ships.

-- ---------------------------------------------------------------------------
-- Permission catalog (global reference data, same for every organization)
-- ---------------------------------------------------------------------------

create table public.permissions (
  key text primary key check (key ~ '^[a-z]+\.[a-z_]+$'),
  area text not null,
  label text not null,
  description text,
  sort_order int not null unique,
  -- permissions this one is useless without (e.g. editing pay needs seeing pay)
  requires text[] not null default '{}'
);

insert into public.permissions (key, area, label, description, sort_order, requires) values
  ('members.manage', 'Members', 'Manage members and roles',
   'Invite and remove members, choose their roles and edit roles. Nobody can give a permission they don''t have.', 10, '{}'),
  ('company.manage', 'Company', 'Edit company settings and see the audit log', null, 20, '{}'),
  ('loads.view', 'Loads', 'View loads and the dispatch board', null, 30, '{}'),
  ('loads.edit', 'Loads', 'Create and edit loads and dispatch', 'Includes stops, assignments, status and the extras paid to drivers on a load.', 31, '{loads.view}'),
  ('loads.override', 'Loads', 'Override an overlapping assignment', null, 32, '{loads.edit}'),
  ('customers.view', 'Customers', 'View customers', null, 40, '{}'),
  ('customers.edit', 'Customers', 'Add and edit customers', null, 41, '{customers.view}'),
  ('fleet.view', 'Trucks and trailers', 'View trucks and trailers', null, 50, '{}'),
  ('fleet.edit', 'Trucks and trailers', 'Add and edit trucks and trailers', 'Includes recording meter readings.', 51, '{fleet.view}'),
  ('fleet.status', 'Trucks and trailers', 'Change truck and trailer status', null, 52, '{fleet.view}'),
  ('fleet.sell', 'Trucks and trailers', 'Mark trucks and trailers sold', null, 53, '{fleet.edit}'),
  ('fleet.correct_readings', 'Trucks and trailers', 'Correct meter readings', null, 54, '{fleet.edit}'),
  ('drivers.view', 'Drivers', 'View drivers', 'Driver details, CDL and medical card.', 60, '{}'),
  ('drivers.edit', 'Drivers', 'Add and edit drivers', null, 61, '{drivers.view}'),
  ('pay.view', 'Driver pay', 'View driver pay, deductions and statements', null, 70, '{drivers.view}'),
  ('pay.edit', 'Driver pay', 'Edit pay rules and deductions', null, 71, '{pay.view}'),
  ('pay.finalize', 'Driver pay', 'Finalize and void pay statements', null, 72, '{pay.view}'),
  ('documents.add', 'Documents', 'Add documents', 'To the drivers, trucks and trailers they can see.', 80, '{}'),
  ('documents.remove', 'Documents', 'Remove documents', 'Removed documents are archived, never deleted.', 81, '{}'),
  ('dashboard.pay', 'Dashboard', 'See driver pay and contribution on the dashboard', null, 90, '{pay.view}');

alter table public.permissions enable row level security;
create policy "everyone signed in reads" on public.permissions for select to authenticated using (true);
revoke all on public.permissions from anon;
revoke insert, update, delete, truncate on public.permissions from authenticated;

-- What each built-in role allows. Owner allows everything and is not listed.
-- The first six reproduce the old role lists exactly; Fleet Director and Fleet Manager follow the
-- table the owner approved on 11/27/2026.
create or replace function public.system_role_permissions(p_role public.org_role)
returns text[]
language sql immutable
set search_path = ''
as $$
  select case p_role
    when 'owner' then '{}'::text[]
    when 'admin' then array['members.manage', 'company.manage', 'loads.view', 'loads.edit', 'loads.override',
      'customers.view', 'customers.edit', 'fleet.view', 'fleet.edit', 'fleet.status', 'fleet.sell',
      'fleet.correct_readings', 'drivers.view', 'drivers.edit', 'pay.view', 'pay.edit', 'pay.finalize',
      'documents.add', 'documents.remove', 'dashboard.pay']
    when 'fleet_director' then array['members.manage', 'loads.view', 'loads.edit', 'loads.override',
      'customers.view', 'customers.edit', 'fleet.view', 'fleet.edit', 'fleet.status', 'drivers.view',
      'drivers.edit', 'pay.view', 'pay.edit', 'pay.finalize', 'documents.add', 'documents.remove', 'dashboard.pay']
    when 'fleet_manager' then array['loads.view', 'loads.edit', 'customers.view', 'fleet.view', 'fleet.edit',
      'fleet.status', 'drivers.view', 'drivers.edit', 'documents.add']
    when 'dispatcher' then array['loads.view', 'loads.edit', 'customers.view', 'customers.edit', 'fleet.view',
      'fleet.status', 'drivers.view', 'documents.add']
    when 'maintenance' then array['loads.view', 'customers.view', 'fleet.view', 'fleet.edit', 'fleet.status',
      'drivers.view', 'documents.add']
    when 'accounting' then array['loads.view', 'customers.view', 'customers.edit', 'fleet.view', 'drivers.view',
      'drivers.edit', 'pay.view', 'pay.edit', 'pay.finalize', 'documents.add', 'dashboard.pay']
    when 'viewer' then array['loads.view', 'customers.view', 'fleet.view']
  end;
$$;

create or replace function public.system_role_name(p_role public.org_role)
returns text
language sql immutable
set search_path = ''
as $$
  select case p_role
    when 'owner' then 'Owner' when 'admin' then 'Admin' when 'fleet_director' then 'Fleet Director'
    when 'fleet_manager' then 'Fleet Manager' when 'dispatcher' then 'Dispatcher'
    when 'maintenance' then 'Maintenance' when 'accounting' then 'Accounting' when 'viewer' then 'Viewer'
  end;
$$;

-- ---------------------------------------------------------------------------
-- Roles per organization
-- ---------------------------------------------------------------------------

create table public.org_roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  -- set for the built-in roles; null for roles the company made
  system_key public.org_role,
  name text not null check (length(btrim(name)) between 1 and 60),
  description text check (length(description) <= 300),
  permissions text[] not null default '{}',
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, system_key)
);
create unique index org_roles_name_uniq on public.org_roles (organization_id, lower(btrim(name)));

create trigger org_roles_set_updated_at before update on public.org_roles
  for each row execute function public.set_updated_at();

-- Permissions must exist and come with what they need; Owner and the kind of a role never change.
create or replace function public.org_roles_validate()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_missing text;
  v_need text;
begin
  if tg_op = 'UPDATE' then
    if new.organization_id <> old.organization_id or new.system_key is distinct from old.system_key then
      raise exception 'A role can''t be moved or change its kind' using errcode = '42501';
    end if;
    if old.system_key = 'owner'
       and (new.name <> old.name or new.permissions <> old.permissions
            or new.description is distinct from old.description) then
      raise exception 'The Owner role can''t be changed' using errcode = 'P0001', hint = 'owner_role';
    end if;
  end if;

  new.name := btrim(new.name);
  new.permissions := array(select distinct p from unnest(new.permissions) p order by p);

  if new.system_key = 'owner' then
    if new.permissions <> '{}' then
      raise exception 'The Owner role allows everything and lists no permissions' using errcode = 'P0001', hint = 'owner_role';
    end if;
    return new;
  end if;

  select p into v_missing from unnest(new.permissions) p
  where not exists (select 1 from public.permissions c where c.key = p) limit 1;
  if v_missing is not null then
    raise exception 'Unknown permission: %', v_missing using errcode = '22023';
  end if;

  select c.label, (select n.label from public.permissions n where n.key = r) into v_missing, v_need
  from public.permissions c, unnest(c.requires) r
  where c.key = any (new.permissions) and not (r = any (new.permissions))
  order by c.sort_order limit 1;
  if v_missing is not null then
    raise exception '"%" needs "%"', v_missing, v_need using errcode = 'P0001', hint = 'permission_requires';
  end if;
  return new;
end;
$$;
create trigger org_roles_validate before insert or update on public.org_roles
  for each row execute function public.org_roles_validate();

-- Built-in roles stay; the organization being deleted takes them along.
create or replace function public.org_roles_keep_system()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.system_key is not null and exists (select 1 from public.organizations where id = old.organization_id) then
    raise exception 'Built-in roles can''t be deleted' using errcode = 'P0001', hint = 'system_role';
  end if;
  return old;
end;
$$;
create trigger org_roles_keep_system before delete on public.org_roles
  for each row execute function public.org_roles_keep_system();

create trigger audit_org_roles after insert or update or delete on public.org_roles
  for each row execute function public.audit_trigger();

-- ---------------------------------------------------------------------------
-- Roles per member (one or more)
-- ---------------------------------------------------------------------------

create table public.member_roles (
  organization_id uuid not null,
  user_id uuid not null,
  role_id uuid not null,
  assigned_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id, role_id),
  foreign key (organization_id, user_id) references public.organization_members (organization_id, user_id) on delete cascade,
  -- a role in use can't be deleted
  foreign key (organization_id, role_id) references public.org_roles (organization_id, id)
);
create index member_roles_role_idx on public.member_roles (organization_id, role_id);
create index member_roles_user_idx on public.member_roles (user_id);

create trigger audit_member_roles after insert or update or delete on public.member_roles
  for each row execute function public.audit_trigger();

-- ---------------------------------------------------------------------------
-- Permission checks (security definer: they read member_roles without recursing into its RLS)
-- ---------------------------------------------------------------------------

create or replace function public.is_org_owner(org uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.member_roles mr
    join public.org_roles r on r.id = mr.role_id
    where mr.organization_id = org and mr.user_id = (select auth.uid()) and r.system_key = 'owner'
  );
$$;

create or replace function public.has_permission(org uuid, perm text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.member_roles mr
    join public.org_roles r on r.id = mr.role_id
    where mr.organization_id = org and mr.user_id = (select auth.uid())
      and (r.system_key = 'owner' or perm = any (r.permissions))
  );
$$;

-- Everything a member is allowed, sorted; an owner gets the whole catalog.
create or replace function public.member_permissions(p_org uuid, p_user uuid)
returns text[]
language sql stable security definer
set search_path = ''
as $$
  with mine as (
    select r.system_key, r.permissions from public.member_roles mr
    join public.org_roles r on r.id = mr.role_id
    where mr.organization_id = p_org and mr.user_id = p_user
  )
  select case
    when exists (select 1 from mine where system_key = 'owner')
      then (select array_agg(key order by key) from public.permissions)
    else (select coalesce(array_agg(distinct p order by p), '{}') from mine, unnest(mine.permissions) p)
  end;
$$;

-- The signed-in user's permissions in an organization (the app shows and hides by this).
create or replace function public.my_permissions(org uuid)
returns text[]
language sql stable security definer
set search_path = ''
as $$
  select public.member_permissions(org, (select auth.uid()));
$$;

-- May the signed-in user hand out these permissions (and, if asked, ownership)?
create or replace function public.can_grant(org uuid, perms text[], grants_owner boolean)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select public.has_permission(org, 'members.manage')
     and (not grants_owner or public.is_org_owner(org))
     and coalesce(perms, '{}') <@ public.my_permissions(org);
$$;

-- May the signed-in user give a member this built-in role?
create or replace function public.can_grant_system_role(org uuid, p_role public.org_role)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select public.can_grant(org, public.system_role_permissions(p_role), p_role = 'owner');
$$;

-- May the signed-in user change or remove this member? Only if they have every permission the member has.
create or replace function public.can_manage_member(org uuid, p_user uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select public.can_grant(org, public.member_permissions(org, p_user),
    exists (select 1 from public.member_roles mr join public.org_roles r on r.id = mr.role_id
            where mr.organization_id = org and mr.user_id = p_user and r.system_key = 'owner'));
$$;

revoke execute on function public.member_permissions(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.is_org_owner(uuid), public.has_permission(uuid, text), public.my_permissions(uuid),
  public.can_grant(uuid, text[], boolean), public.can_grant_system_role(uuid, public.org_role),
  public.can_manage_member(uuid, uuid) from public, anon;
grant execute on function public.is_org_owner(uuid), public.has_permission(uuid, text), public.my_permissions(uuid),
  public.can_grant(uuid, text[], boolean), public.can_grant_system_role(uuid, public.org_role),
  public.can_manage_member(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Built-in roles for every organization, now and when one is created
-- ---------------------------------------------------------------------------

create or replace function public.create_system_roles()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.org_roles (organization_id, system_key, name, permissions, created_by)
  select new.id, k, public.system_role_name(k), public.system_role_permissions(k), null
  from unnest(enum_range(null::public.org_role)) k
  on conflict (organization_id, system_key) do nothing;
  return new;
end;
$$;
revoke execute on function public.create_system_roles() from public, anon, authenticated;
create trigger organizations_create_system_roles after insert on public.organizations
  for each row execute function public.create_system_roles();

insert into public.org_roles (organization_id, system_key, name, permissions, created_by)
select o.id, k, public.system_role_name(k), public.system_role_permissions(k), null
from public.organizations o, unnest(enum_range(null::public.org_role)) k
on conflict (organization_id, system_key) do nothing;

-- Transition: organization_members.role (set by sign-up, invitations and the Members screen)
-- decides the member's built-in role.
create or replace function public.sync_member_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.member_roles
  where organization_id = new.organization_id and user_id = new.user_id;
  insert into public.member_roles (organization_id, user_id, role_id, assigned_by)
  select new.organization_id, new.user_id, r.id, (select auth.uid())
  from public.org_roles r
  where r.organization_id = new.organization_id and r.system_key = new.role;
  if not found then
    raise exception 'The organization has no % role', new.role using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke execute on function public.sync_member_role() from public, anon, authenticated;
create trigger organization_members_sync_role_insert after insert on public.organization_members
  for each row execute function public.sync_member_role();
create trigger organization_members_sync_role_update after update of role on public.organization_members
  for each row when (old.role is distinct from new.role) execute function public.sync_member_role();

insert into public.member_roles (organization_id, user_id, role_id, assigned_by, created_at)
select m.organization_id, m.user_id, r.id, null, m.created_at
from public.organization_members m
join public.org_roles r on r.organization_id = m.organization_id and r.system_key = m.role
on conflict do nothing;

-- RLS: members see their organization's roles and who has which. Writes come with the Roles screen.
alter table public.org_roles enable row level security;
alter table public.member_roles enable row level security;
create policy "members read" on public.org_roles
  for select to authenticated using (public.is_org_member(organization_id));
create policy "members read" on public.member_roles
  for select to authenticated using (public.is_org_member(organization_id));
revoke all on public.org_roles, public.member_roles from anon;
revoke insert, update, delete, truncate on public.org_roles, public.member_roles from authenticated;

-- ---------------------------------------------------------------------------
-- 0001 tenancy: organizations, members, invitations, audit log
-- ---------------------------------------------------------------------------

drop policy "owner admin update" on public.organizations;
create policy "company managers update" on public.organizations
  for update to authenticated
  using (public.has_permission(id, 'company.manage'))
  with check (public.has_permission(id, 'company.manage'));

-- Change a member's role: only members whose permissions you fully have, only to a role you could give.
drop policy "owner admin update" on public.organization_members;
create policy "member managers update" on public.organization_members
  for update to authenticated
  using (public.can_manage_member(organization_id, user_id))
  with check (public.can_grant_system_role(organization_id, role));

drop policy "owner admin remove or self leave" on public.organization_members;
create policy "member managers remove or self leave" on public.organization_members
  for delete to authenticated
  using (user_id = (select auth.uid()) or public.can_manage_member(organization_id, user_id));

drop policy "owner admin read" on public.invitations;
create policy "member managers read" on public.invitations
  for select to authenticated
  using (public.has_permission(organization_id, 'members.manage'));

drop policy "owner admin invite" on public.invitations;
create policy "member managers invite" on public.invitations
  for insert to authenticated
  with check (
    public.can_grant_system_role(organization_id, role)
    and invited_by = (select auth.uid())
    and accepted_at is null
    and accepted_by is null
  );

drop policy "owner admin revoke" on public.invitations;
create policy "member managers revoke" on public.invitations
  for delete to authenticated
  using (accepted_at is null and public.can_grant_system_role(organization_id, role));

drop policy "owner admin read" on public.audit_logs;
create policy "company managers read" on public.audit_logs
  for select to authenticated
  using (public.has_permission(organization_id, 'company.manage'));

-- ---------------------------------------------------------------------------
-- 0003 fleet: trucks, trailers, meter readings
-- ---------------------------------------------------------------------------

drop policy "members read" on public.trucks;
drop policy "editors insert" on public.trucks;
drop policy "editors and dispatch update" on public.trucks;
create policy "fleet readers" on public.trucks
  for select to authenticated using (public.has_permission(organization_id, 'fleet.view'));
create policy "fleet editors insert" on public.trucks
  for insert to authenticated with check (public.has_permission(organization_id, 'fleet.edit'));
create policy "fleet editors and status update" on public.trucks
  for update to authenticated
  using (public.has_permission(organization_id, 'fleet.edit') or public.has_permission(organization_id, 'fleet.status'))
  with check (public.has_permission(organization_id, 'fleet.edit') or public.has_permission(organization_id, 'fleet.status'));

drop policy "members read" on public.trailers;
drop policy "editors insert" on public.trailers;
drop policy "editors and dispatch update" on public.trailers;
create policy "fleet readers" on public.trailers
  for select to authenticated using (public.has_permission(organization_id, 'fleet.view'));
create policy "fleet editors insert" on public.trailers
  for insert to authenticated with check (public.has_permission(organization_id, 'fleet.edit'));
create policy "fleet editors and status update" on public.trailers
  for update to authenticated
  using (public.has_permission(organization_id, 'fleet.edit') or public.has_permission(organization_id, 'fleet.status'))
  with check (public.has_permission(organization_id, 'fleet.edit') or public.has_permission(organization_id, 'fleet.status'));

drop policy "members read" on public.odometer_readings;
drop policy "editors insert" on public.odometer_readings;
create policy "fleet readers" on public.odometer_readings
  for select to authenticated using (public.has_permission(organization_id, 'fleet.view'));
create policy "fleet editors insert" on public.odometer_readings
  for insert to authenticated with check (public.has_permission(organization_id, 'fleet.edit'));

-- Sold assets stay read-only, except for system-maintained columns (body as in 0003d; checks now by permission).
create or replace function public.fleet_asset_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_system text[] := array['updated_at', 'archived_at', 'archived_by', 'created_by',
                           'current_odometer', 'hubodometer', 'reefer_hours'];
  v_old jsonb := to_jsonb(old);
  v_new jsonb := to_jsonb(new);
  v_col text;
  v_meter text;
begin
  -- Those who may only change the status (the only others RLS lets through) change nothing else.
  if v_actor is not null
     and not public.has_permission(old.organization_id, 'fleet.edit')
     and (v_new - 'status' - 'updated_at') <> (v_old - 'status' - 'updated_at') then
    raise exception 'You can only change the status' using errcode = '42501';
  end if;

  -- Selling and un-selling needs its own permission.
  if (old.status = 'sold') <> (new.status = 'sold')
     and v_actor is not null
     and not public.has_permission(old.organization_id, 'fleet.sell') then
    raise exception 'You don''t have permission to change a sold status' using errcode = '42501', hint = 'sold_status';
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
  if v_actor is not null and not public.has_permission(new.organization_id, 'fleet.edit') then
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
    if v_actor is not null and not public.has_permission(new.organization_id, 'fleet.correct_readings') then
      raise exception 'You don''t have permission to correct a reading' using errcode = '42501', hint = 'meter_correction';
    end if;
  elsif v_current is not null and new.reading < v_current then
    raise exception 'Reading % is lower than the current % of %', new.reading, new.reading_type, v_current
      using errcode = 'P0001', hint = 'meter_decrease';
  end if;

  new.created_by := coalesce(v_actor, new.created_by);
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 0003b drivers and pay rules
-- ---------------------------------------------------------------------------

drop policy "staff read" on public.drivers;
drop policy "editors insert" on public.drivers;
drop policy "editors update" on public.drivers;
create policy "driver readers" on public.drivers
  for select to authenticated using (public.has_permission(organization_id, 'drivers.view'));
create policy "driver editors insert" on public.drivers
  for insert to authenticated with check (public.has_permission(organization_id, 'drivers.edit'));
create policy "driver editors update" on public.drivers
  for update to authenticated
  using (public.has_permission(organization_id, 'drivers.edit'))
  with check (public.has_permission(organization_id, 'drivers.edit'));

drop policy "pay readers" on public.driver_pay_rules;
drop policy "pay editors insert" on public.driver_pay_rules;
drop policy "pay editors update" on public.driver_pay_rules;
drop policy "pay editors delete future" on public.driver_pay_rules;
create policy "pay readers" on public.driver_pay_rules
  for select to authenticated using (public.has_permission(organization_id, 'pay.view'));
create policy "pay editors insert" on public.driver_pay_rules
  for insert to authenticated with check (public.has_permission(organization_id, 'pay.edit'));
create policy "pay editors update" on public.driver_pay_rules
  for update to authenticated
  using (public.has_permission(organization_id, 'pay.edit'))
  with check (public.has_permission(organization_id, 'pay.edit'));
create policy "pay editors delete future" on public.driver_pay_rules
  for delete to authenticated using (public.has_permission(organization_id, 'pay.edit'));

-- Pay rules in effect stay immutable (body as in 0003d; access check now by permission).
create or replace function public.driver_pay_rules_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := public.org_today(old.organization_id);
begin
  if tg_op = 'UPDATE'
     and (to_jsonb(new) - 'created_by' - 'updated_at') = (to_jsonb(old) - 'created_by' - 'updated_at') then
    return new;
  end if;
  -- Check access before revealing anything (this function bypasses RLS).
  if (select auth.uid()) is not null and not public.has_permission(old.organization_id, 'pay.edit') then
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

-- ---------------------------------------------------------------------------
-- 0003c customers
-- ---------------------------------------------------------------------------

drop policy "members read" on public.customers;
drop policy "editors insert" on public.customers;
drop policy "editors update" on public.customers;
create policy "customer readers" on public.customers
  for select to authenticated using (public.has_permission(organization_id, 'customers.view'));
create policy "customer editors insert" on public.customers
  for insert to authenticated with check (public.has_permission(organization_id, 'customers.edit'));
create policy "customer editors update" on public.customers
  for update to authenticated
  using (public.has_permission(organization_id, 'customers.edit'))
  with check (public.has_permission(organization_id, 'customers.edit'));

drop policy "members read" on public.customer_contacts;
drop policy "editors insert" on public.customer_contacts;
drop policy "editors update" on public.customer_contacts;
drop policy "editors delete" on public.customer_contacts;
create policy "customer readers" on public.customer_contacts
  for select to authenticated using (public.has_permission(organization_id, 'customers.view'));
create policy "customer editors insert" on public.customer_contacts
  for insert to authenticated with check (public.has_permission(organization_id, 'customers.edit'));
create policy "customer editors update" on public.customer_contacts
  for update to authenticated
  using (public.has_permission(organization_id, 'customers.edit'))
  with check (public.has_permission(organization_id, 'customers.edit'));
create policy "customer editors delete" on public.customer_contacts
  for delete to authenticated using (public.has_permission(organization_id, 'customers.edit'));

-- ---------------------------------------------------------------------------
-- 0004 loads (and 0004g facilities)
-- ---------------------------------------------------------------------------

drop policy "members read" on public.loads;
drop policy "dispatch insert" on public.loads;
drop policy "dispatch update" on public.loads;
create policy "load readers" on public.loads
  for select to authenticated using (public.has_permission(organization_id, 'loads.view'));
create policy "dispatch insert" on public.loads
  for insert to authenticated with check (public.has_permission(organization_id, 'loads.edit'));
create policy "dispatch update" on public.loads
  for update to authenticated
  using (public.has_permission(organization_id, 'loads.edit'))
  with check (public.has_permission(organization_id, 'loads.edit'));

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
      and public.has_permission(l.organization_id, 'loads.edit')
  );
$$;

drop policy "members read" on public.load_stops;
create policy "load readers" on public.load_stops
  for select to authenticated using (public.has_permission(organization_id, 'loads.view'));
drop policy "members read" on public.load_drivers;
create policy "load readers" on public.load_drivers
  for select to authenticated using (public.has_permission(organization_id, 'loads.view'));
drop policy "members read" on public.load_accessorials;
create policy "load readers" on public.load_accessorials
  for select to authenticated using (public.has_permission(organization_id, 'loads.view'));
drop policy "members read" on public.load_events;
create policy "load readers" on public.load_events
  for select to authenticated using (public.has_permission(organization_id, 'loads.view'));

drop policy "members read" on public.facilities;
drop policy "dispatch update" on public.facilities;
create policy "load readers" on public.facilities
  for select to authenticated using (public.has_permission(organization_id, 'loads.view'));
create policy "dispatch update" on public.facilities
  for update to authenticated
  using (public.has_permission(organization_id, 'loads.edit'))
  with check (public.has_permission(organization_id, 'loads.edit'));

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
  if v_load.id is null or not public.has_permission(v_load.organization_id, 'loads.edit') then
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

-- Override of the overlapping-assignment warning, recorded on the load.
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
  if v_org is null or not public.has_permission(v_org, 'loads.override') then
    raise exception 'You don''t have permission to override this warning' using errcode = '42501';
  end if;
  if coalesce(length(btrim(p_reason)), 0) = 0 then
    raise exception 'A reason is required' using errcode = 'P0001', hint = 'reason_required';
  end if;
  insert into public.load_events (organization_id, load_id, kind, reason)
  values (v_org, p_load, 'assignment_override', btrim(p_reason));
end;
$$;

-- ---------------------------------------------------------------------------
-- 0004c / 0004d driver pay on loads, deductions, statements
-- ---------------------------------------------------------------------------

-- Dispatch records extras on loads; pay people see and change them too.
drop policy "dispatch and pay read" on public.load_driver_items;
drop policy "dispatch and pay write" on public.load_driver_items;
create policy "dispatch and pay read" on public.load_driver_items
  for select to authenticated
  using (public.has_permission(organization_id, 'loads.edit') or public.has_permission(organization_id, 'pay.view'));
create policy "dispatch and pay write" on public.load_driver_items
  for all to authenticated
  using (public.has_permission(organization_id, 'loads.edit') or public.has_permission(organization_id, 'pay.edit'))
  with check (public.has_permission(organization_id, 'loads.edit') or public.has_permission(organization_id, 'pay.edit'));

drop policy "pay readers" on public.driver_deductions;
drop policy "pay editors insert" on public.driver_deductions;
drop policy "pay editors update" on public.driver_deductions;
create policy "pay readers" on public.driver_deductions
  for select to authenticated using (public.has_permission(organization_id, 'pay.view'));
create policy "pay editors insert" on public.driver_deductions
  for insert to authenticated with check (public.has_permission(organization_id, 'pay.edit'));
create policy "pay editors update" on public.driver_deductions
  for update to authenticated
  using (public.has_permission(organization_id, 'pay.edit'))
  with check (public.has_permission(organization_id, 'pay.edit'));

drop policy "pay readers" on public.driver_statements;
drop policy "pay readers" on public.driver_statement_lines;
create policy "pay readers" on public.driver_statements
  for select to authenticated using (public.has_permission(organization_id, 'pay.view'));
create policy "pay readers" on public.driver_statement_lines
  for select to authenticated using (public.has_permission(organization_id, 'pay.view'));

-- finalize / void: bodies as in 0004d; access check now by permission.
create or replace function public.finalize_driver_statement(
  p_org uuid,
  p_driver uuid,
  p_week date,
  p_header jsonb,
  p_lines jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_prev_net bigint;
  v_carried bigint;
  v_line jsonb;
  v_pos int := 0;
  v_load uuid;
  v_status public.load_status;
  v_number text;
begin
  if not public.has_permission(p_org, 'pay.finalize') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  -- Serializes finalize/void for one driver.
  perform 1 from public.drivers where id = p_driver and organization_id = p_org for update;
  if not found then
    raise exception 'Driver not found' using errcode = '42501';
  end if;
  if p_week is null or extract(isodow from p_week) <> 1 then
    raise exception 'A pay week starts on a Monday' using errcode = '22023';
  end if;
  if p_week + 7 > public.org_today(p_org) then
    raise exception 'This week isn''t over yet' using errcode = 'P0001', hint = 'week_not_over';
  end if;
  if exists (select 1 from public.driver_statements
             where driver_id = p_driver and voided_at is null and week_start >= p_week) then
    raise exception 'A statement for this week or a later week is already finalized'
      using errcode = 'P0001', hint = 'statement_order';
  end if;

  select net_cents into v_prev_net from public.driver_statements
  where driver_id = p_driver and voided_at is null and week_start < p_week
  order by week_start desc limit 1;
  v_carried := least(coalesce(v_prev_net, 0), 0);
  if (p_header ->> 'carried_in_cents')::bigint is distinct from v_carried then
    raise exception 'The balance carried in has changed — reload the statement' using errcode = 'P0001', hint = 'statement_stale';
  end if;

  insert into public.driver_statements (organization_id, driver_id, week_start, load_count, gross_cents, company_fee_cents,
    extras_cents, deductions_cents, carried_in_cents, net_cents)
  values (p_org, p_driver, p_week, (p_header ->> 'load_count')::int, (p_header ->> 'gross_cents')::bigint,
    (p_header ->> 'company_fee_cents')::bigint, (p_header ->> 'extras_cents')::bigint,
    (p_header ->> 'deductions_cents')::bigint, v_carried, (p_header ->> 'net_cents')::bigint)
  returning id into v_id;

  for v_line in select * from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) loop
    v_pos := v_pos + 1;
    v_load := nullif(v_line ->> 'load_id', '')::uuid;
    if v_line ->> 'line_type' = 'load' then
      select l.status, l.load_number into v_status, v_number from public.loads l
      join public.load_drivers ld on ld.load_id = l.id and ld.driver_id = p_driver
      where l.id = v_load and l.organization_id = p_org;
      if v_status is null then
        raise exception 'A load on the statement is not this driver''s' using errcode = 'P0001', hint = 'statement_stale';
      end if;
      if v_status not in ('delivered', 'invoiced', 'paid') then
        raise exception 'Load % is not delivered yet', v_number using errcode = 'P0001', hint = 'statement_stale';
      end if;
      if exists (select 1 from public.driver_statement_lines sl join public.driver_statements s on s.id = sl.statement_id
                 where sl.load_id = v_load and sl.line_type = 'load' and s.driver_id = p_driver
                   and s.voided_at is null and s.id <> v_id) then
        raise exception 'Load % is already on another statement', v_number using errcode = 'P0001', hint = 'statement_stale';
      end if;
    end if;
    insert into public.driver_statement_lines (organization_id, statement_id, position, line_type, load_id, deduction_id,
      description, detail, miles, value_cents, fee_cents, amount_cents)
    values (p_org, v_id, v_pos, (v_line ->> 'line_type')::public.statement_line_type, v_load,
      nullif(v_line ->> 'deduction_id', '')::uuid, v_line ->> 'description', v_line ->> 'detail',
      (v_line ->> 'miles')::numeric, (v_line ->> 'value_cents')::bigint, (v_line ->> 'fee_cents')::bigint,
      (v_line ->> 'amount_cents')::bigint);
  end loop;

  if (select count(*) from public.driver_statement_lines where statement_id = v_id and line_type = 'load')
     <> (p_header ->> 'load_count')::int
     or (select coalesce(sum(amount_cents), 0) from public.driver_statement_lines where statement_id = v_id)
     <> (p_header ->> 'net_cents')::bigint
     or (select count(*) from public.driver_statement_lines where statement_id = v_id and line_type = 'carryover')
     <> (case when v_carried < 0 then 1 else 0 end) then
    raise exception 'Statement lines do not add up' using errcode = '22023';
  end if;
  return v_id;
end;
$$;

create or replace function public.void_driver_statement(p_statement uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_s public.driver_statements;
begin
  select * into v_s from public.driver_statements where id = p_statement;
  if v_s.id is null or not public.has_permission(v_s.organization_id, 'pay.finalize') then
    raise exception 'Statement not found' using errcode = '42501';
  end if;
  perform 1 from public.drivers where id = v_s.driver_id for update;
  if v_s.voided_at is not null then
    raise exception 'This statement is already void' using errcode = 'P0001', hint = 'statement_stale';
  end if;
  if length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'A reason is required' using errcode = 'P0001', hint = 'reason_required';
  end if;
  if exists (select 1 from public.driver_statements
             where driver_id = v_s.driver_id and voided_at is null and week_start > v_s.week_start) then
    raise exception 'Void the later statements first — they carry this balance' using errcode = 'P0001', hint = 'statement_order';
  end if;
  update public.driver_statements
  set voided_at = now(), voided_by = auth.uid(), void_reason = btrim(p_reason)
  where id = p_statement;
end;
$$;

-- ---------------------------------------------------------------------------
-- 0008a documents: seeing follows the entity; adding and removing are permissions
-- ---------------------------------------------------------------------------

create or replace function public.can_view_documents(p_org uuid, p_entity text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select case p_entity
    when 'driver' then public.has_permission(p_org, 'drivers.view')
    when 'truck' then public.has_permission(p_org, 'fleet.view')
    when 'trailer' then public.has_permission(p_org, 'fleet.view')
    else false
  end;
$$;

create or replace function public.can_add_documents(p_org uuid, p_entity text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select public.can_view_documents(p_org, p_entity) and public.has_permission(p_org, 'documents.add');
$$;

-- Archive: the document leaves the list, the file and the record stay.
create or replace function public.archive_document(p_document uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_entity text;
begin
  select organization_id, entity_type into v_org, v_entity
  from public.documents where id = p_document and archived_at is null;
  if v_org is null or not public.has_permission(v_org, 'documents.remove')
     or not public.can_view_documents(v_org, v_entity) then
    raise exception 'Document not found' using errcode = '42501';
  end if;
  update public.documents set archived_at = now(), archived_by = auth.uid() where id = p_document;
end;
$$;
