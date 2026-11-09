-- Tenancy & RLS tests for migration 0001. Run: npm run test:db
-- Relies on supabase/seed.sql (Lakeside = Org A, Prairie Haul = Org B).
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- Fixtures -------------------------------------------------------------------
-- Org A (Lakeside):  a0000000-0000-4000-8000-000000000001
-- Org B (Prairie):   b0000000-0000-4000-8000-000000000001
-- A owner 1000..01, A admin 1000..02, A dispatcher 1000..03, A viewer 1000..06
-- B owner 2000..01

-- Extra users for invitation tests (verified and unverified email).
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
values
  ('00000000-0000-0000-0000-000000000000', '30000000-0000-4000-8000-000000000001', 'authenticated',
   'authenticated', 'newhire@example.test', '', now(), now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '30000000-0000-4000-8000-000000000002', 'authenticated',
   'authenticated', 'unverified@example.test', '', null, now(), now(), '', '', '', '');

create function pg_temp.login(uid text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

create function pg_temp.logout() returns void language sql as $$
  select set_config('role', 'postgres', true);
  select set_config('request.jwt.claims', '', true);
$$;

-- =============================================================================
-- Anonymous
-- =============================================================================
select set_config('role', 'anon', true);
select throws_ok($$ select * from public.organizations $$, '42501', null, 'anon cannot read organizations');
select throws_ok($$ select * from public.organization_members $$, '42501', null, 'anon cannot read members');
select throws_ok($$ select public.create_organization('Anon Co') $$, '42501', null, 'anon cannot create an organization');
select pg_temp.logout();

-- =============================================================================
-- Isolation: Org A owner vs Org B
-- =============================================================================
select pg_temp.login('10000000-0000-4000-8000-000000000001');

select results_eq($$ select name from public.organizations $$, array['Lakeside Freight LLC'],
  'Org A owner sees only Org A');
select is((select count(*)::int from public.organization_members
           where organization_id = 'b0000000-0000-4000-8000-000000000001'), 0,
  'Org A owner cannot read Org B members');
select is((select count(*)::int from public.audit_logs
           where organization_id = 'b0000000-0000-4000-8000-000000000001'), 0,
  'Org A owner cannot read Org B audit logs');
select ok((select count(*) from public.audit_logs) > 0, 'Org A owner can read Org A audit logs');

-- Writes against Org B are silently filtered (0 rows) or rejected.
update public.organizations set name = 'Hacked' where id = 'b0000000-0000-4000-8000-000000000001';
update public.organization_members set role = 'viewer' where organization_id = 'b0000000-0000-4000-8000-000000000001';
delete from public.organization_members where organization_id = 'b0000000-0000-4000-8000-000000000001';

select throws_ok($$
  insert into public.invitations (organization_id, email, role, token_hash, invited_by)
  values ('b0000000-0000-4000-8000-000000000001', 'x@example.test', 'admin', repeat('a', 64),
          '10000000-0000-4000-8000-000000000001') $$,
  '42501', null, 'Org A owner cannot invite into Org B');
select throws_ok($$
  insert into public.organizations (name) values ('Direct insert') $$,
  '42501', null, 'organizations cannot be inserted directly');
select throws_ok($$
  insert into public.organization_members (organization_id, user_id, role)
  values ('b0000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'owner') $$,
  '42501', null, 'cannot add yourself to another organization');
select throws_ok($$
  insert into public.audit_logs (organization_id, action, table_name)
  values ('a0000000-0000-4000-8000-000000000001', 'insert', 'fake') $$,
  '42501', null, 'audit logs cannot be written directly');
select pg_temp.logout();

select is((select name from public.organizations where id = 'b0000000-0000-4000-8000-000000000001'),
  'Prairie Haul Inc', 'Org B name unchanged');
select is((select count(*)::int from public.organization_members
           where organization_id = 'b0000000-0000-4000-8000-000000000001' and role = 'owner'), 1,
  'Org B membership unchanged');

-- =============================================================================
-- Isolation: Org B owner vs Org A
-- =============================================================================
select pg_temp.login('20000000-0000-4000-8000-000000000001');
select results_eq($$ select name from public.organizations $$, array['Prairie Haul Inc'],
  'Org B owner sees only Org B');
select is((select count(*)::int from public.organization_members
           where organization_id = 'a0000000-0000-4000-8000-000000000001'), 0,
  'Org B owner cannot read Org A members');
update public.organizations set name = 'Hacked' where id = 'a0000000-0000-4000-8000-000000000001';
select pg_temp.logout();
select is((select name from public.organizations where id = 'a0000000-0000-4000-8000-000000000001'),
  'Lakeside Freight LLC', 'Org A name unchanged');

-- =============================================================================
-- Roles inside Org A
-- =============================================================================
select pg_temp.login('10000000-0000-4000-8000-000000000006'); -- viewer
select is((select count(*)::int from public.organization_members), 6, 'viewer sees own org members');
select is((select count(*)::int from public.audit_logs), 0, 'viewer cannot read audit logs');
select is((select count(*)::int from public.invitations), 0, 'viewer cannot read invitations');
update public.organizations set name = 'Viewer edit' where id = 'a0000000-0000-4000-8000-000000000001';
update public.organization_members set role = 'owner' where user_id = '10000000-0000-4000-8000-000000000006';
select pg_temp.logout();
select is((select name from public.organizations where id = 'a0000000-0000-4000-8000-000000000001'),
  'Lakeside Freight LLC', 'viewer cannot edit organization');
select is((select role::text from public.organization_members where user_id = '10000000-0000-4000-8000-000000000006'),
  'viewer', 'viewer cannot promote self');

select pg_temp.login('10000000-0000-4000-8000-000000000003'); -- dispatcher
select throws_ok($$
  insert into public.invitations (organization_id, email, role, token_hash, invited_by)
  values ('a0000000-0000-4000-8000-000000000001', 'x@example.test', 'viewer', repeat('b', 64),
          '10000000-0000-4000-8000-000000000003') $$,
  '42501', null, 'dispatcher cannot invite');
select pg_temp.logout();

-- Admin
select pg_temp.login('10000000-0000-4000-8000-000000000002');
update public.organizations set name = 'Lakeside Freight LLC (admin edit)' where id = 'a0000000-0000-4000-8000-000000000001';
select throws_ok($$ update public.organizations set created_by = null
                    where id = 'a0000000-0000-4000-8000-000000000001' $$,
  '42501', null, 'created_by is not updatable');
select throws_ok($$
  insert into public.invitations (organization_id, email, role, token_hash, invited_by)
  values ('a0000000-0000-4000-8000-000000000001', 'boss@example.test', 'owner', repeat('c', 64),
          '10000000-0000-4000-8000-000000000002') $$,
  '42501', null, 'admin cannot invite an owner');
select lives_ok($$
  insert into public.invitations (organization_id, email, role, token_hash, invited_by)
  values ('a0000000-0000-4000-8000-000000000001', 'clerk@example.test', 'accounting', repeat('d', 64),
          '10000000-0000-4000-8000-000000000002') $$,
  'admin can invite a non-owner role');
select throws_ok($$ update public.organization_members set role = 'owner'
                    where user_id = '10000000-0000-4000-8000-000000000003' $$,
  '42501', null, 'admin cannot grant the owner role');
update public.organization_members set role = 'viewer' where user_id = '10000000-0000-4000-8000-000000000001';
delete from public.organization_members where user_id = '10000000-0000-4000-8000-000000000001';
update public.organization_members set role = 'maintenance' where user_id = '10000000-0000-4000-8000-000000000003';
select pg_temp.logout();

select is((select name from public.organizations where id = 'a0000000-0000-4000-8000-000000000001'),
  'Lakeside Freight LLC (admin edit)', 'admin can edit organization');
select is((select role::text from public.organization_members where user_id = '10000000-0000-4000-8000-000000000001'),
  'owner', 'admin cannot demote or remove an owner');
select is((select role::text from public.organization_members where user_id = '10000000-0000-4000-8000-000000000003'),
  'maintenance', 'admin can change a non-owner role but cannot grant owner');
select is((select count(*)::int from public.audit_logs
           where table_name = 'organizations' and action = 'update'
             and actor_id = '10000000-0000-4000-8000-000000000002'), 1,
  'organization update is audited with the actor');

-- =============================================================================
-- Last owner protection
-- =============================================================================
select pg_temp.login('10000000-0000-4000-8000-000000000001');
select throws_ok($$ update public.organization_members set role = 'admin'
                    where user_id = '10000000-0000-4000-8000-000000000001'
                      and organization_id = 'a0000000-0000-4000-8000-000000000001' $$,
  'P0001', 'An organization must have at least one owner', 'last owner cannot be demoted');
select throws_ok($$ delete from public.organization_members
                    where user_id = '10000000-0000-4000-8000-000000000001'
                      and organization_id = 'a0000000-0000-4000-8000-000000000001' $$,
  'P0001', 'An organization must have at least one owner', 'last owner cannot leave');
update public.organization_members set role = 'owner' where user_id = '10000000-0000-4000-8000-000000000002';
select lives_ok($$ update public.organization_members set role = 'admin'
                   where user_id = '10000000-0000-4000-8000-000000000001'
                     and organization_id = 'a0000000-0000-4000-8000-000000000001' $$,
  'an owner can step down once another owner exists');
select pg_temp.logout();

-- =============================================================================
-- Removing a member revokes access immediately
-- =============================================================================
select pg_temp.login('10000000-0000-4000-8000-000000000002'); -- now an owner
delete from public.organization_members where user_id = '10000000-0000-4000-8000-000000000006';
select pg_temp.logout();
select pg_temp.login('10000000-0000-4000-8000-000000000006');
select is((select count(*)::int from public.organizations), 0, 'removed member sees no organization');
select is((select count(*)::int from public.organization_members), 0, 'removed member sees no members');
select pg_temp.logout();

-- =============================================================================
-- create_organization
-- =============================================================================
select pg_temp.login('30000000-0000-4000-8000-000000000001');
select lives_ok($$ select public.create_organization('New Hire Trucking', 'America/Denver', '1234567', null, null, null, 'co') $$,
  'authenticated user can create an organization');
select results_eq($$ select name, state::text, timezone from public.organizations $$,
  $$ values ('New Hire Trucking', 'CO', 'America/Denver') $$, 'organization created with normalized fields');
select results_eq($$ select role::text from public.organization_members $$, array['owner'],
  'creator becomes the owner');
select throws_ok($$ select public.create_organization('Bad TZ', 'Mars/Olympus') $$,
  '22023', null, 'unknown time zone is rejected');
select pg_temp.logout();

-- =============================================================================
-- Invitations
-- =============================================================================
select pg_temp.login('20000000-0000-4000-8000-000000000001'); -- Org B owner
insert into public.invitations (organization_id, email, role, token_hash, invited_by) values
  ('b0000000-0000-4000-8000-000000000001', 'newhire@example.test', 'dispatcher',
   encode(extensions.digest('tok-valid', 'sha256'), 'hex'), '20000000-0000-4000-8000-000000000001'),
  ('b0000000-0000-4000-8000-000000000001', 'someone.else@example.test', 'viewer',
   encode(extensions.digest('tok-other-email', 'sha256'), 'hex'), '20000000-0000-4000-8000-000000000001');
select lives_ok($$
  insert into public.invitations (organization_id, email, role, token_hash, invited_by)
  values ('b0000000-0000-4000-8000-000000000001', 'coowner@example.test', 'owner', repeat('e', 64),
          '20000000-0000-4000-8000-000000000001') $$,
  'owner can invite an owner');
select ok((select expires_at between now() + interval '6 days 23 hours' and now() + interval '7 days 1 minute'
           from public.invitations where email = 'newhire@example.test'),
  'invitation expires in 7 days by default');
select throws_ok($$
  insert into public.invitations (organization_id, email, role, token_hash, invited_by)
  values ('b0000000-0000-4000-8000-000000000001', 'forged@example.test', 'viewer', repeat('f', 64),
          '10000000-0000-4000-8000-000000000001') $$,
  '42501', null, 'invited_by must be the caller');
select pg_temp.logout();

-- expired invitation (backdated as superuser; Org A, because Org B already has
-- an open invitation for this email)
insert into public.invitations (organization_id, email, role, token_hash, expires_at)
values ('a0000000-0000-4000-8000-000000000001', 'newhire@example.test', 'admin',
        encode(extensions.digest('tok-expired', 'sha256'), 'hex'), now() - interval '1 minute');

select pg_temp.login('30000000-0000-4000-8000-000000000002');
select throws_ok($$ select public.accept_invitation('tok-valid') $$, '42501',
  'Email address is not verified', 'unverified email cannot accept');
select pg_temp.logout();

select pg_temp.login('30000000-0000-4000-8000-000000000001');
select throws_ok($$ select public.accept_invitation('tok-other-email') $$, '42501',
  'Invitation was sent to a different email address', 'cannot accept an invitation for another email');
select throws_ok($$ select public.accept_invitation('tok-expired') $$, 'P0002', null,
  'expired invitation is rejected');
select throws_ok($$ select public.accept_invitation('no-such-token') $$, 'P0002', null,
  'unknown token is rejected');
select is(public.accept_invitation('tok-valid'), 'b0000000-0000-4000-8000-000000000001'::uuid,
  'valid invitation is accepted');
select results_eq($$ select role::text from public.organization_members
                    where organization_id = 'b0000000-0000-4000-8000-000000000001'
                      and user_id = '30000000-0000-4000-8000-000000000001' $$,
  array['dispatcher'], 'accepting grants the invited role');
select throws_ok($$ select public.accept_invitation('tok-valid') $$, 'P0002', null,
  'invitation cannot be reused');
select is((select count(*)::int from public.organizations), 2,
  'new member now sees both of their organizations');
select pg_temp.logout();

select is((select count(*)::int from public.audit_logs
           where table_name = 'invitations' and (old_data ? 'token_hash' or new_data ? 'token_hash')), 0,
  'token hashes are never written to the audit log');

-- =============================================================================
-- audit_logs is insert-only, even for the superuser
-- =============================================================================
select throws_ok($$ update public.audit_logs set table_name = 'x' $$, '42501', 'audit_logs is insert-only',
  'audit log rows cannot be updated');
select throws_ok($$ delete from public.audit_logs $$, '42501', 'audit_logs is insert-only',
  'audit log rows cannot be deleted');

select * from finish();
rollback;
