-- 0009c_roles_screen
-- Roles the company makes itself, and one or more roles per member (owner's decision of 11/27/2026,
-- PRODUCT_SPEC.md §4.1). member_roles becomes the only record of who has which role:
--   * organization_members.role and invitations.role go away (invitations carry role_ids instead);
--   * the "at least one owner" guard moves to member_roles;
--   * roles, member roles and invitations are written only through the functions below, which check
--     that the caller manages members and never gives a permission they don't have.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Every permission the given roles of an organization allow together (Owner: the whole catalog),
-- or null if any of them is not a role of that organization.
create or replace function public.roles_permissions(p_org uuid, p_role_ids uuid[])
returns text[]
language sql stable security definer
set search_path = ''
as $$
  with picked as (
    select r.system_key, r.permissions from public.org_roles r
    where r.organization_id = p_org and r.id = any (p_role_ids)
  )
  select case
    when (select count(*) from picked) <> cardinality(array(select distinct unnest(p_role_ids))) then null
    when exists (select 1 from picked where system_key = 'owner')
      then (select array_agg(key order by key) from public.permissions)
    else (select coalesce(array_agg(distinct p order by p), '{}') from picked, unnest(picked.permissions) p)
  end;
$$;
revoke execute on function public.roles_permissions(uuid, uuid[]) from public, anon, authenticated;

-- May the signed-in user give these roles (all of the organization's, none beyond their own rights)?
create or replace function public.can_grant_roles(org uuid, p_role_ids uuid[])
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select public.roles_permissions(org, p_role_ids) is not null
     and public.can_grant(org, public.roles_permissions(org, p_role_ids),
       exists (select 1 from public.org_roles where organization_id = org and id = any (p_role_ids) and system_key = 'owner'));
$$;
revoke execute on function public.can_grant_roles(uuid, uuid[]) from public, anon;
grant execute on function public.can_grant_roles(uuid, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Members: roles live in member_roles only
-- ---------------------------------------------------------------------------

drop trigger organization_members_sync_role_insert on public.organization_members;
drop trigger organization_members_sync_role_update on public.organization_members;
drop function public.sync_member_role();
drop trigger organization_members_keep_owner on public.organization_members;
drop function public.prevent_removing_last_owner();
drop policy "member managers update" on public.organization_members;
revoke update on public.organization_members from authenticated;

-- An organization must always keep at least one owner. Deleting the organization is exempt.
create or replace function public.member_roles_keep_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.org_roles where id = old.role_id and system_key = 'owner') then
    return old;
  end if;
  if not exists (select 1 from public.organizations where id = old.organization_id) then
    return old;
  end if;
  if not exists (
    select 1 from public.member_roles mr join public.org_roles r on r.id = mr.role_id
    where mr.organization_id = old.organization_id and r.system_key = 'owner' and mr.user_id <> old.user_id
  ) then
    raise exception 'An organization must have at least one owner' using errcode = 'P0001', hint = 'last_owner';
  end if;
  return old;
end;
$$;
revoke execute on function public.member_roles_keep_owner() from public, anon, authenticated;
create trigger member_roles_keep_owner before delete on public.member_roles
  for each row execute function public.member_roles_keep_owner();

-- The member list (0002) now returns each member's roles.
drop function public.list_organization_members(uuid);
alter table public.organization_members drop column role;

create function public.list_organization_members(p_org uuid)
returns table (
  user_id uuid,
  email text,
  first_name text,
  last_name text,
  role_ids uuid[],
  is_owner boolean,
  joined_at timestamptz
)
language sql stable security definer
set search_path = ''
as $$
  select m.user_id,
         u.email::text,
         nullif(u.raw_user_meta_data ->> 'first_name', ''),
         nullif(u.raw_user_meta_data ->> 'last_name', ''),
         coalesce((select array_agg(mr.role_id) from public.member_roles mr
                   where mr.organization_id = m.organization_id and mr.user_id = m.user_id), '{}'),
         exists (select 1 from public.member_roles mr join public.org_roles r on r.id = mr.role_id
                 where mr.organization_id = m.organization_id and mr.user_id = m.user_id and r.system_key = 'owner'),
         m.created_at
  from public.organization_members m
  join auth.users u on u.id = m.user_id
  where m.organization_id = p_org
    and public.is_org_member(p_org)
  order by lower(u.email);
$$;
revoke execute on function public.list_organization_members(uuid) from public, anon;
grant execute on function public.list_organization_members(uuid) to authenticated;

-- Give a member exactly these roles. Only someone who could give everything the member has now and
-- everything they get. Unchanged roles stay (so the last owner can keep Owner while gaining another role).
create or replace function public.set_member_roles(p_org uuid, p_user uuid, p_role_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[] := array(select distinct unnest(coalesce(p_role_ids, '{}')));
begin
  if not exists (select 1 from public.organization_members where organization_id = p_org and user_id = p_user)
     or not public.can_manage_member(p_org, p_user) then
    raise exception 'Member not found' using errcode = '42501';
  end if;
  if cardinality(v_ids) = 0 then
    raise exception 'A member needs at least one role' using errcode = 'P0001', hint = 'no_roles';
  end if;
  if not public.can_grant_roles(p_org, v_ids) then
    raise exception 'You can''t give a role with permissions you don''t have' using errcode = '42501', hint = 'cannot_grant';
  end if;

  insert into public.member_roles (organization_id, user_id, role_id)
  select p_org, p_user, r from unnest(v_ids) r
  on conflict do nothing;
  delete from public.member_roles
  where organization_id = p_org and user_id = p_user and not (role_id = any (v_ids));
end;
$$;
revoke execute on function public.set_member_roles(uuid, uuid, uuid[]) from public, anon;
grant execute on function public.set_member_roles(uuid, uuid, uuid[]) to authenticated;

-- Creating an organization (0001): the creator gets the Owner role.
create or replace function public.create_organization(
  p_name text,
  p_timezone text default 'America/Chicago',
  p_usdot_number text default null,
  p_mc_number text default null,
  p_address_line1 text default null,
  p_city text default null,
  p_state text default null,
  p_zip text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_org uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = p_timezone) then
    raise exception 'Unknown time zone: %', p_timezone using errcode = '22023';
  end if;

  insert into public.organizations
    (name, timezone, usdot_number, mc_number, address_line1, city, state, zip, created_by)
  values
    (btrim(p_name), p_timezone, nullif(btrim(p_usdot_number), ''), nullif(btrim(p_mc_number), ''),
     nullif(btrim(p_address_line1), ''), nullif(btrim(p_city), ''),
     upper(nullif(btrim(p_state), '')), nullif(btrim(p_zip), ''), v_uid)
  returning id into v_org;

  insert into public.organization_members (organization_id, user_id) values (v_org, v_uid);
  insert into public.member_roles (organization_id, user_id, role_id)
  select v_org, v_uid, id from public.org_roles where organization_id = v_org and system_key = 'owner';

  return v_org;
end;
$$;

-- ---------------------------------------------------------------------------
-- Invitations carry one or more roles
-- ---------------------------------------------------------------------------

drop policy "member managers invite" on public.invitations;
drop policy "member managers revoke" on public.invitations;
drop function public.get_invitation_preview(text);

alter table public.invitations add column role_ids uuid[] not null default '{}';
update public.invitations i set role_ids = array[r.id]
from public.org_roles r where r.organization_id = i.organization_id and r.system_key = i.role;
alter table public.invitations drop column role;
alter table public.invitations add constraint invitations_has_roles check (cardinality(role_ids) > 0);

drop function public.can_grant_system_role(uuid, public.org_role);
drop function public.has_org_role(uuid, public.org_role[]);

revoke insert on public.invitations from authenticated;
create policy "member managers revoke" on public.invitations
  for delete to authenticated
  using (accepted_at is null and public.can_grant_roles(organization_id, role_ids));

create or replace function public.create_invitation(p_org uuid, p_email text, p_role_ids uuid[], p_token_hash text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[] := array(select distinct unnest(coalesce(p_role_ids, '{}')));
  v_id uuid;
begin
  if not public.has_permission(p_org, 'members.manage') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if cardinality(v_ids) = 0 then
    raise exception 'Choose at least one role' using errcode = 'P0001', hint = 'no_roles';
  end if;
  if not public.can_grant_roles(p_org, v_ids) then
    raise exception 'You can''t give a role with permissions you don''t have' using errcode = '42501', hint = 'cannot_grant';
  end if;
  insert into public.invitations (organization_id, email, role_ids, token_hash, invited_by)
  values (p_org, lower(btrim(p_email)), v_ids, p_token_hash, (select auth.uid()))
  returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.create_invitation(uuid, text, uuid[], text) from public, anon;
grant execute on function public.create_invitation(uuid, text, uuid[], text) to authenticated;

-- What an invitation link points to, for whoever holds the raw token (body as in 0002, with role names).
create function public.get_invitation_preview(p_token text)
returns table (
  organization_name text,
  role_names text[],
  email text,
  status text
)
language sql stable security definer
set search_path = ''
as $$
  select o.name,
         coalesce((select array_agg(r.name order by r.name) from public.org_roles r
                   where r.organization_id = i.organization_id and r.id = any (i.role_ids)), '{}'),
         i.email,
         case
           when i.accepted_at is not null then 'accepted'
           when i.expires_at <= now() then 'expired'
           else 'pending'
         end
  from public.invitations i
  join public.organizations o on o.id = i.organization_id
  where i.token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
$$;
revoke execute on function public.get_invitation_preview(text) from public, anon;
grant execute on function public.get_invitation_preview(text) to authenticated;

-- Accepting (body as in 0001): a new member gets the invitation's roles; an existing member keeps theirs.
create or replace function public.accept_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_email text;
  v_inv public.invitations;
  v_new int;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select lower(email) into v_email
  from auth.users
  where id = v_uid and email_confirmed_at is not null;

  if v_email is null then
    raise exception 'Email address is not verified' using errcode = '42501';
  end if;

  select * into v_inv
  from public.invitations
  where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
  for update;

  if v_inv.id is null or v_inv.accepted_at is not null or v_inv.expires_at <= now() then
    raise exception 'Invitation is invalid or has expired' using errcode = 'P0002';
  end if;

  if v_inv.email <> v_email then
    raise exception 'Invitation was sent to a different email address' using errcode = '42501';
  end if;

  insert into public.organization_members (organization_id, user_id)
  values (v_inv.organization_id, v_uid)
  on conflict (organization_id, user_id) do nothing;
  get diagnostics v_new = row_count;

  if v_new = 1 then
    insert into public.member_roles (organization_id, user_id, role_id, assigned_by)
    select v_inv.organization_id, v_uid, r.id, v_inv.invited_by
    from public.org_roles r
    where r.organization_id = v_inv.organization_id and r.id = any (v_inv.role_ids);
    if not found then
      raise exception 'The roles of this invitation no longer exist; ask for a new invitation'
        using errcode = 'P0001', hint = 'invitation_roles_gone';
    end if;
  end if;

  update public.invitations
  set accepted_at = now(), accepted_by = v_uid
  where id = v_inv.id;

  return v_inv.organization_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Roles: create, edit, reset, delete
-- ---------------------------------------------------------------------------

create or replace function public.create_role(p_org uuid, p_name text, p_description text, p_permissions text[])
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.can_grant(p_org, coalesce(p_permissions, '{}'), false) then
    raise exception 'You can''t give permissions you don''t have' using errcode = '42501', hint = 'cannot_grant';
  end if;
  insert into public.org_roles (organization_id, name, description, permissions)
  values (p_org, p_name, nullif(btrim(coalesce(p_description, '')), ''), coalesce(p_permissions, '{}'))
  returning id into v_id;
  return v_id;
end;
$$;

-- Edit a role. Built-in roles keep their name; Owner can't be edited. The caller must hold everything
-- the role allows before and after.
create or replace function public.update_role(p_role uuid, p_name text, p_description text, p_permissions text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_r public.org_roles;
begin
  select * into v_r from public.org_roles where id = p_role for update;
  if v_r.id is null or not public.has_permission(v_r.organization_id, 'members.manage') then
    raise exception 'Role not found' using errcode = '42501';
  end if;
  if v_r.system_key = 'owner' then
    raise exception 'The Owner role can''t be changed' using errcode = 'P0001', hint = 'owner_role';
  end if;
  if not public.can_grant(v_r.organization_id, v_r.permissions, false)
     or not public.can_grant(v_r.organization_id, coalesce(p_permissions, '{}'), false) then
    raise exception 'You can''t give permissions you don''t have' using errcode = '42501', hint = 'cannot_grant';
  end if;
  update public.org_roles set
    name = case when v_r.system_key is null then p_name else name end,
    description = nullif(btrim(coalesce(p_description, '')), ''),
    permissions = coalesce(p_permissions, '{}')
  where id = p_role;
end;
$$;

-- Put a built-in role back to the permissions it came with.
create or replace function public.reset_role(p_role uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_r public.org_roles;
begin
  select * into v_r from public.org_roles where id = p_role for update;
  if v_r.id is null or v_r.system_key is null then
    raise exception 'Role not found' using errcode = '42501';
  end if;
  perform public.update_role(p_role, v_r.name, v_r.description, public.system_role_permissions(v_r.system_key));
end;
$$;

-- Delete a role the company made, while nobody has it and no open invitation gives it.
create or replace function public.delete_role(p_role uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_r public.org_roles;
begin
  select * into v_r from public.org_roles where id = p_role for update;
  if v_r.id is null or not public.has_permission(v_r.organization_id, 'members.manage')
     or not public.can_grant(v_r.organization_id, v_r.permissions, false) then
    raise exception 'Role not found' using errcode = '42501';
  end if;
  if v_r.system_key is not null then
    raise exception 'Built-in roles can''t be deleted' using errcode = 'P0001', hint = 'system_role';
  end if;
  if exists (select 1 from public.member_roles where role_id = p_role)
     or exists (select 1 from public.invitations where p_role = any (role_ids) and accepted_at is null) then
    raise exception 'Take this role away from everyone (and revoke invitations with it) first'
      using errcode = 'P0001', hint = 'role_in_use';
  end if;
  delete from public.org_roles where id = p_role;
end;
$$;

revoke execute on function public.create_role(uuid, text, text, text[]), public.update_role(uuid, text, text, text[]),
  public.reset_role(uuid), public.delete_role(uuid) from public, anon;
grant execute on function public.create_role(uuid, text, text, text[]), public.update_role(uuid, text, text, text[]),
  public.reset_role(uuid), public.delete_role(uuid) to authenticated;
