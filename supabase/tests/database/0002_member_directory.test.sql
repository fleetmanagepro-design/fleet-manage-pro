-- Tests for migration 0002 (member directory, invitation preview).
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

create function pg_temp.login(uid text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;
create function pg_temp.logout() returns void language sql as $$
  select set_config('role', 'postgres', true);
  select set_config('request.jwt.claims', '', true);
$$;

insert into public.invitations (organization_id, email, role, token_hash, expires_at) values
  ('b0000000-0000-4000-8000-000000000001', 'pending@example.test', 'dispatcher',
   encode(extensions.digest('tok-pending', 'sha256'), 'hex'), now() + interval '1 day'),
  ('b0000000-0000-4000-8000-000000000001', 'old@example.test', 'viewer',
   encode(extensions.digest('tok-old', 'sha256'), 'hex'), now() - interval '1 day');

-- list_organization_members -------------------------------------------------
select set_config('role', 'anon', true);
select throws_ok($$ select * from public.list_organization_members('a0000000-0000-4000-8000-000000000001') $$,
  '42501', null, 'anon cannot list members');
select pg_temp.logout();

select pg_temp.login('10000000-0000-4000-8000-000000000003'); -- Org A dispatcher
select is((select count(*)::int from public.list_organization_members('a0000000-0000-4000-8000-000000000001')), 6,
  'Org A member lists Org A members');
select results_eq(
  $$ select email, first_name, role::text from public.list_organization_members('a0000000-0000-4000-8000-000000000001')
     where role = 'owner' $$,
  $$ values ('owner@lakesidefreight.test', 'Mark', 'owner') $$,
  'member list includes email, name and role');
select is((select count(*)::int from public.list_organization_members('b0000000-0000-4000-8000-000000000001')), 0,
  'Org A member cannot list Org B members');
select pg_temp.logout();

select pg_temp.login('20000000-0000-4000-8000-000000000001'); -- Org B owner
select is((select count(*)::int from public.list_organization_members('a0000000-0000-4000-8000-000000000001')), 0,
  'Org B owner cannot list Org A members');
select pg_temp.logout();

-- get_invitation_preview ----------------------------------------------------
select set_config('role', 'anon', true);
select throws_ok($$ select * from public.get_invitation_preview('tok-pending') $$,
  '42501', null, 'anon cannot preview invitations');
select pg_temp.logout();

select pg_temp.login('10000000-0000-4000-8000-000000000006'); -- unrelated user (Org A viewer)
select results_eq($$ select organization_name, role::text, email, status from public.get_invitation_preview('tok-pending') $$,
  $$ values ('Prairie Haul Inc', 'dispatcher', 'pending@example.test', 'pending') $$,
  'token holder sees what the invitation is for');
select is((select status from public.get_invitation_preview('tok-old')), 'expired', 'expired invitation reported');
select is((select count(*)::int from public.get_invitation_preview('wrong-token')), 0, 'unknown token reveals nothing');
select is((select count(*)::int from public.get_invitation_preview(null)), 0, 'null token reveals nothing');
select pg_temp.logout();

select * from finish();
rollback;
