-- 0002_member_directory
-- Read helpers for the Members screen and the accept-invitation page.
-- auth.users is not exposed to clients, so these security definer functions
-- return only what each screen needs, after checking access themselves.

-- Members of an organization with their email and name.
-- Any member may list colleagues (same rule as organization_members RLS).
create or replace function public.list_organization_members(p_org uuid)
returns table (
  user_id uuid,
  email text,
  first_name text,
  last_name text,
  role public.org_role,
  joined_at timestamptz
)
language sql stable security definer
set search_path = ''
as $$
  select m.user_id,
         u.email::text,
         nullif(u.raw_user_meta_data ->> 'first_name', ''),
         nullif(u.raw_user_meta_data ->> 'last_name', ''),
         m.role,
         m.created_at
  from public.organization_members m
  join auth.users u on u.id = m.user_id
  where m.organization_id = p_org
    and public.is_org_member(p_org)
  order by m.role, lower(u.email);
$$;

-- What an invitation link points to, for whoever holds the raw token.
-- Possessing the token is the authorization; nothing else is revealed.
create or replace function public.get_invitation_preview(p_token text)
returns table (
  organization_name text,
  role public.org_role,
  email text,
  status text
)
language sql stable security definer
set search_path = ''
as $$
  select o.name,
         i.role,
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

revoke execute on function public.list_organization_members(uuid) from public, anon;
grant execute on function public.list_organization_members(uuid) to authenticated;
revoke execute on function public.get_invitation_preview(text) from public, anon;
grant execute on function public.get_invitation_preview(text) to authenticated;
