-- 0001_tenancy
-- Organizations, memberships, invitations, RLS helper functions,
-- generic updated_at trigger and the audit log.
--
-- Business rules (see docs/PRODUCT_SPEC.md §4.1):
--   * Only an owner can grant the owner role (invite, promote).
--   * An organization can never be left without an owner.
--   * Invitations expire 7 days after creation and are single-use.
--   * Memberships are only created through create_organization() and
--     accept_invitation(); there is no direct insert path for users.

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

create type public.org_role as enum (
  'owner', 'admin', 'dispatcher', 'maintenance', 'accounting', 'viewer'
);

create type public.audit_action as enum ('insert', 'update', 'void', 'delete');

-- ---------------------------------------------------------------------------
-- Generic trigger: keep updated_at current
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 200),
  usdot_number text check (usdot_number ~ '^[0-9]{1,8}$'),
  mc_number text check (mc_number ~ '^[0-9]{1,8}$'),
  address_line1 text,
  city text,
  state char(2) check (state ~ '^[A-Z]{2}$'),
  zip text check (zip ~ '^[0-9]{5}(-[0-9]{4})?$'),
  timezone text not null default 'America/Chicago',
  overhead_allocation text not null default 'by_miles'
    check (overhead_allocation in ('by_miles', 'per_truck', 'none')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger organizations_set_updated_at
  before update on public.organizations
  for each row execute function public.set_updated_at();

create table public.organization_members (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.org_role not null,
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create index organization_members_user_id_idx on public.organization_members (user_id);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  email text not null check (email = lower(btrim(email)) and email like '%_@_%'),
  role public.org_role not null,
  -- sha256 hex of the raw token; the raw token only ever exists in the email link
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  invited_by uuid references auth.users (id) on delete set null,
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index invitations_organization_id_idx on public.invitations (organization_id);
-- At most one open invitation per email per organization.
create unique index invitations_open_email_uniq
  on public.invitations (organization_id, email)
  where accepted_at is null;

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  actor_id uuid references auth.users (id) on delete set null,
  action public.audit_action not null,
  table_name text not null,
  record_id uuid,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);

create index audit_logs_org_created_idx on public.audit_logs (organization_id, created_at desc);
create index audit_logs_record_idx on public.audit_logs (table_name, record_id);
create index audit_logs_actor_id_idx on public.audit_logs (actor_id);

-- ---------------------------------------------------------------------------
-- RLS helper functions
-- security definer so they can read organization_members without
-- recursing into that table's own policies.
-- ---------------------------------------------------------------------------

create or replace function public.is_org_member(org uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organization_members
    where organization_id = org and user_id = (select auth.uid())
  );
$$;

create or replace function public.has_org_role(org uuid, roles public.org_role[])
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organization_members
    where organization_id = org
      and user_id = (select auth.uid())
      and role = any (roles)
  );
$$;

revoke execute on function public.is_org_member(uuid) from public, anon;
revoke execute on function public.has_org_role(uuid, public.org_role[]) from public, anon;
grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.has_org_role(uuid, public.org_role[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Audit trigger (generic; attach to every business table)
--   * organization id: `id` for organizations, `organization_id` elsewhere
--   * record id: `id`, falling back to `user_id` (organization_members)
--   * an update that sets voided_at is recorded as 'void'
--   * columns passed as trigger arguments are stripped from the snapshot
-- ---------------------------------------------------------------------------

create or replace function public.audit_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_action public.audit_action;
  v_org uuid;
  v_col text;
begin
  if tg_op = 'UPDATE' and v_old = v_new then
    return new;
  end if;

  v_action := case tg_op
    when 'INSERT' then 'insert'
    when 'DELETE' then 'delete'
    else case
      when v_new ? 'voided_at'
        and v_old ->> 'voided_at' is null
        and v_new ->> 'voided_at' is not null then 'void'
      else 'update'
    end
  end::public.audit_action;

  v_org := case when tg_table_name = 'organizations'
    then (v_row ->> 'id')::uuid
    else (v_row ->> 'organization_id')::uuid
  end;

  if tg_nargs > 0 then
    foreach v_col in array tg_argv loop
      v_old := v_old - v_col;
      v_new := v_new - v_col;
    end loop;
  end if;

  insert into public.audit_logs
    (organization_id, actor_id, action, table_name, record_id, old_data, new_data)
  values (
    v_org,
    (select auth.uid()),
    v_action,
    tg_table_name,
    coalesce(v_row ->> 'id', v_row ->> 'user_id')::uuid,
    v_old,
    v_new
  );

  return coalesce(new, old);
end;
$$;

revoke execute on function public.audit_trigger() from public, anon, authenticated;

-- audit_logs is insert-only for everyone, including the service role.
create or replace function public.audit_logs_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit_logs is insert-only' using errcode = '42501';
end;
$$;

create trigger audit_logs_no_update_delete
  before update or delete on public.audit_logs
  for each row execute function public.audit_logs_immutable();

create trigger audit_organizations
  after insert or update on public.organizations
  for each row execute function public.audit_trigger();

create trigger audit_organization_members
  after insert or update or delete on public.organization_members
  for each row execute function public.audit_trigger();

create trigger audit_invitations
  after insert or update or delete on public.invitations
  for each row execute function public.audit_trigger('token_hash');

-- ---------------------------------------------------------------------------
-- Guard: an organization must always keep at least one owner.
-- Organization deletion (cascade) is exempt.
-- ---------------------------------------------------------------------------

create or replace function public.prevent_removing_last_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.role <> 'owner' then
    return coalesce(new, old);
  end if;
  if tg_op = 'UPDATE' and new.role = 'owner' and new.organization_id = old.organization_id then
    return new;
  end if;
  if not exists (select 1 from public.organizations where id = old.organization_id) then
    return coalesce(new, old); -- organization itself is being deleted
  end if;
  if not exists (
    select 1 from public.organization_members
    where organization_id = old.organization_id
      and role = 'owner'
      and user_id <> old.user_id
  ) then
    raise exception 'An organization must have at least one owner'
      using errcode = 'P0001', hint = 'last_owner';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger organization_members_keep_owner
  before update or delete on public.organization_members
  for each row execute function public.prevent_removing_last_owner();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.invitations enable row level security;
alter table public.audit_logs enable row level security;

-- organizations: members read; owner/admin update; insert only via
-- create_organization(); no delete in MVP.
create policy "members read" on public.organizations
  for select to authenticated
  using (public.is_org_member(id));

create policy "owner admin update" on public.organizations
  for update to authenticated
  using (public.has_org_role(id, array['owner', 'admin']::public.org_role[]))
  with check (public.has_org_role(id, array['owner', 'admin']::public.org_role[]));

-- organization_members: members see their colleagues.
create policy "members read" on public.organization_members
  for select to authenticated
  using (public.is_org_member(organization_id));

-- Owner/admin change roles; only an owner may touch an owner row or grant owner.
create policy "owner admin update" on public.organization_members
  for update to authenticated
  using (
    public.has_org_role(organization_id, array['owner', 'admin']::public.org_role[])
    and (role <> 'owner' or public.has_org_role(organization_id, array['owner']::public.org_role[]))
  )
  with check (
    public.has_org_role(organization_id, array['owner', 'admin']::public.org_role[])
    and (role <> 'owner' or public.has_org_role(organization_id, array['owner']::public.org_role[]))
  );

-- Owner/admin remove members (admin cannot remove an owner); anyone may leave.
create policy "owner admin remove or self leave" on public.organization_members
  for delete to authenticated
  using (
    user_id = (select auth.uid())
    or (
      public.has_org_role(organization_id, array['owner', 'admin']::public.org_role[])
      and (role <> 'owner' or public.has_org_role(organization_id, array['owner']::public.org_role[]))
    )
  );

-- invitations: owner/admin manage; only an owner may invite an owner.
create policy "owner admin read" on public.invitations
  for select to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin']::public.org_role[]));

create policy "owner admin invite" on public.invitations
  for insert to authenticated
  with check (
    public.has_org_role(organization_id, array['owner', 'admin']::public.org_role[])
    and (role <> 'owner' or public.has_org_role(organization_id, array['owner']::public.org_role[]))
    and invited_by = (select auth.uid())
    and accepted_at is null
    and accepted_by is null
  );

create policy "owner admin revoke" on public.invitations
  for delete to authenticated
  using (
    accepted_at is null
    and public.has_org_role(organization_id, array['owner', 'admin']::public.org_role[])
    and (role <> 'owner' or public.has_org_role(organization_id, array['owner']::public.org_role[]))
  );

-- audit_logs: owner/admin read; written only by the audit trigger.
create policy "owner admin read" on public.audit_logs
  for select to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin']::public.org_role[]));

-- ---------------------------------------------------------------------------
-- Privileges (defence in depth on top of RLS)
-- ---------------------------------------------------------------------------

revoke all on public.organizations, public.organization_members,
  public.invitations, public.audit_logs from anon;

revoke insert, update, delete, truncate on public.organizations from authenticated;
grant update (name, usdot_number, mc_number, address_line1, city, state, zip,
  timezone, overhead_allocation) on public.organizations to authenticated;

revoke insert, update, truncate on public.organization_members from authenticated;
grant update (role) on public.organization_members to authenticated;

revoke update, truncate on public.invitations from authenticated;
revoke insert, update, delete, truncate on public.audit_logs from authenticated;

-- ---------------------------------------------------------------------------
-- RPC: create an organization and make the caller its owner (atomic)
-- ---------------------------------------------------------------------------

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

  insert into public.organization_members (organization_id, user_id, role)
  values (v_org, v_uid, 'owner');

  return v_org;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: accept an invitation with the raw token from the email link.
-- The signed-in user's verified email must match the invitation.
-- If the user is already a member, their existing role is kept.
-- ---------------------------------------------------------------------------

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

  insert into public.organization_members (organization_id, user_id, role)
  values (v_inv.organization_id, v_uid, v_inv.role)
  on conflict (organization_id, user_id) do nothing;

  update public.invitations
  set accepted_at = now(), accepted_by = v_uid
  where id = v_inv.id;

  return v_inv.organization_id;
end;
$$;

revoke execute on function public.create_organization(text, text, text, text, text, text, text, text) from public, anon;
revoke execute on function public.accept_invitation(text) from public, anon;
grant execute on function public.create_organization(text, text, text, text, text, text, text, text) to authenticated;
grant execute on function public.accept_invitation(text) to authenticated;
