-- Roles and permissions (migration 0009). Run: npm run test:db
-- Relies on supabase/seed.sql: Org A (Lakeside) owner ..01, admin ..02, dispatcher ..03, maintenance ..04,
-- accounting ..05, viewer ..06; Org B (Prairie Haul) owner 2000..01.
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

-- A Fleet Director (..07) and a Fleet Manager (..08) in Org A.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
values
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000007', 'authenticated',
   'authenticated', 'director@example.test', '', now(), now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000008', 'authenticated',
   'authenticated', 'manager@example.test', '', now(), now(), now(), '', '', '', '');
insert into public.organization_members (organization_id, user_id, role) values
  ('a0000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000007', 'fleet_director'),
  ('a0000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000008', 'fleet_manager');

-- =============================================================================
-- Built-in roles and the move from one role per member
-- =============================================================================
select is((select count(*)::int from public.org_roles r where r.system_key is not null
           group by r.organization_id having r.organization_id = 'a0000000-0000-4000-8000-000000000001'), 8,
  'Org A has the eight built-in roles');
select is((select count(*)::int from public.organizations o
           where (select count(*) from public.org_roles r where r.organization_id = o.id) <> 8), 0,
  'every organization has the eight built-in roles');
select is((select count(*)::int from public.organization_members m
           where (select array_agg(r.system_key) from public.member_roles mr join public.org_roles r on r.id = mr.role_id
                  where mr.organization_id = m.organization_id and mr.user_id = m.user_id) is distinct from array[m.role]), 0,
  'every member has exactly the built-in role of their old role');

-- No policy or function still decides by a list of roles.
select is((select count(*)::int from pg_policies
           where coalesce(qual, '') ~ 'has_org_role' or coalesce(with_check, '') ~ 'has_org_role'), 0,
  'no RLS policy uses has_org_role');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname <> 'has_org_role' and p.prosrc ~ 'has_org_role'), 0,
  'no function uses has_org_role');

-- =============================================================================
-- Existing roles keep exactly the rights the old role lists gave
-- =============================================================================
create temp table expected (key text, roles public.org_role[]);
insert into expected values
  ('members.manage', '{owner,admin}'), ('company.manage', '{owner,admin}'),
  ('loads.view', '{owner,admin,dispatcher,maintenance,accounting,viewer}'),
  ('loads.edit', '{owner,admin,dispatcher}'), ('loads.override', '{owner,admin}'),
  ('customers.view', '{owner,admin,dispatcher,maintenance,accounting,viewer}'),
  ('customers.edit', '{owner,admin,dispatcher,accounting}'),
  ('fleet.view', '{owner,admin,dispatcher,maintenance,accounting,viewer}'),
  ('fleet.edit', '{owner,admin,maintenance}'), ('fleet.status', '{owner,admin,maintenance,dispatcher}'),
  ('fleet.sell', '{owner,admin}'), ('fleet.correct_readings', '{owner,admin}'),
  ('drivers.view', '{owner,admin,accounting,dispatcher,maintenance}'), ('drivers.edit', '{owner,admin,accounting}'),
  ('pay.view', '{owner,admin,accounting}'), ('pay.edit', '{owner,admin,accounting}'),
  ('pay.finalize', '{owner,admin,accounting}'), ('dashboard.pay', '{owner,admin,accounting}'),
  ('documents.add', '{owner,admin,accounting,dispatcher,maintenance}'), ('documents.remove', '{owner,admin}');

select is((select count(*)::int from public.permissions p where not exists (select 1 from expected e where e.key = p.key)), 0,
  'every permission in the catalog is covered by this test');

select is(public.member_permissions(m.organization_id, m.user_id),
          (select coalesce(array_agg(e.key order by e.key), '{}') from expected e where m.role = any (e.roles)),
          m.role || ' keeps the same rights')
from public.organization_members m
where m.organization_id = 'a0000000-0000-4000-8000-000000000001' and m.role not in ('fleet_director', 'fleet_manager');

-- Fleet Director and Fleet Manager follow the approved table.
select is(public.member_permissions('a0000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000007'),
  array['customers.edit', 'customers.view', 'dashboard.pay', 'documents.add', 'documents.remove', 'drivers.edit',
        'drivers.view', 'fleet.edit', 'fleet.status', 'fleet.view', 'loads.edit', 'loads.override', 'loads.view',
        'members.manage', 'pay.edit', 'pay.finalize', 'pay.view'],
  'Fleet Director permissions');
select is(public.member_permissions('a0000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000008'),
  array['customers.view', 'documents.add', 'drivers.edit', 'drivers.view', 'fleet.edit', 'fleet.status', 'fleet.view',
        'loads.edit', 'loads.view'],
  'Fleet Manager permissions');

-- =============================================================================
-- Fleet Manager in practice
-- =============================================================================
select pg_temp.login('10000000-0000-4000-8000-000000000008');
select ok((select count(*) from public.loads) > 0, 'Fleet Manager sees loads');
select ok((select count(*) from public.drivers) > 0, 'Fleet Manager sees drivers');
select is((select count(*)::int from public.driver_pay_rules), 0, 'Fleet Manager does not see pay rules');
select is((select count(*)::int from public.driver_statements), 0, 'Fleet Manager does not see statements');
select ok((select count(*) from public.customers) > 0, 'Fleet Manager sees customers');
with u as (update public.customers set notes = 'x' returning 1) select is((select count(*)::int from u), 0,
  'Fleet Manager cannot edit customers');
select throws_ok($$ select public.record_load_override((select id from public.loads limit 1), 'test') $$,
  '42501', null, 'Fleet Manager cannot override an overlapping assignment');
select is((select count(*)::int from public.invitations), 0, 'Fleet Manager does not see invitations');
select throws_ok($$
  insert into public.invitations (organization_id, email, role, token_hash, invited_by)
  values ('a0000000-0000-4000-8000-000000000001', 'x@example.test', 'viewer', repeat('b', 64),
          '10000000-0000-4000-8000-000000000008') $$,
  '42501', null, 'Fleet Manager cannot invite');
with u as (update public.trucks set notes = 'fm' where organization_id = 'a0000000-0000-4000-8000-000000000001'
           and status <> 'sold' returning 1)
select ok((select count(*) from u) > 0, 'Fleet Manager can edit trucks');
select pg_temp.logout();

-- =============================================================================
-- Fleet Director in practice: manages members, but never beyond their own rights
-- =============================================================================
select pg_temp.login('10000000-0000-4000-8000-000000000007');
select ok((select count(*) from public.driver_pay_rules) > 0, 'Fleet Director sees pay rules');
select lives_ok($$ select public.record_load_override((select id from public.loads limit 1), 'test') $$,
  'Fleet Director can override an overlapping assignment');
select is((select count(*)::int from public.audit_logs), 0, 'Fleet Director does not see the audit log');
with u as (update public.organizations set name = 'Renamed' returning 1) select is((select count(*)::int from u), 0,
  'Fleet Director cannot edit company settings');

select lives_ok($$
  insert into public.invitations (organization_id, email, role, token_hash, invited_by)
  values ('a0000000-0000-4000-8000-000000000001', 'fm@example.test', 'fleet_manager', repeat('c', 64),
          '10000000-0000-4000-8000-000000000007') $$,
  'Fleet Director can invite a Fleet Manager');
select throws_ok($$
  insert into public.invitations (organization_id, email, role, token_hash, invited_by)
  values ('a0000000-0000-4000-8000-000000000001', 'ad@example.test', 'admin', repeat('d', 64),
          '10000000-0000-4000-8000-000000000007') $$,
  '42501', null, 'Fleet Director cannot invite an Admin (more rights than their own)');
select throws_ok($$
  insert into public.invitations (organization_id, email, role, token_hash, invited_by)
  values ('a0000000-0000-4000-8000-000000000001', 'ow@example.test', 'owner', repeat('e', 64),
          '10000000-0000-4000-8000-000000000007') $$,
  '42501', null, 'Fleet Director cannot invite an Owner');

-- dispatcher ..03 → fleet manager: allowed
update public.organization_members set role = 'fleet_manager'
where organization_id = 'a0000000-0000-4000-8000-000000000001' and user_id = '10000000-0000-4000-8000-000000000003';
select pg_temp.logout();
select is((select r.system_key from public.member_roles mr join public.org_roles r on r.id = mr.role_id
           where mr.user_id = '10000000-0000-4000-8000-000000000003'), 'fleet_manager'::public.org_role,
  'Fleet Director changed a Dispatcher to Fleet Manager, and member_roles followed');
select pg_temp.login('10000000-0000-4000-8000-000000000007');

select throws_ok($$ update public.organization_members set role = 'admin'
  where organization_id = 'a0000000-0000-4000-8000-000000000001' and user_id = '10000000-0000-4000-8000-000000000003' $$,
  '42501', null, 'Fleet Director cannot make someone an Admin');
with u as (update public.organization_members set role = 'viewer'
           where user_id = '10000000-0000-4000-8000-000000000002' returning 1)
select is((select count(*)::int from u), 0, 'Fleet Director cannot change an Admin');
with d as (delete from public.organization_members where user_id = '10000000-0000-4000-8000-000000000002' returning 1)
select is((select count(*)::int from d), 0, 'Fleet Director cannot remove an Admin');
-- maintenance ..04 has fleet.edit... and nothing the director lacks: may be removed
with d as (delete from public.organization_members where user_id = '10000000-0000-4000-8000-000000000004' returning 1)
select is((select count(*)::int from d), 1, 'Fleet Director can remove a member with fewer rights');
select pg_temp.logout();

-- Accounting has nothing beyond the director either, but the director can't touch the Owner.
select pg_temp.login('10000000-0000-4000-8000-000000000007');
with u as (update public.organization_members set role = 'viewer'
           where user_id = '10000000-0000-4000-8000-000000000001' returning 1)
select is((select count(*)::int from u), 0, 'Fleet Director cannot change the Owner');
select pg_temp.logout();

-- Admin still manages everyone but the Owner.
select pg_temp.login('10000000-0000-4000-8000-000000000002');
with u as (update public.organization_members set role = 'dispatcher'
           where user_id = '10000000-0000-4000-8000-000000000007' returning 1)
select is((select count(*)::int from u), 1, 'Admin can change a Fleet Director');
with u as (update public.organization_members set role = 'viewer'
           where user_id = '10000000-0000-4000-8000-000000000001' returning 1)
select is((select count(*)::int from u), 0, 'Admin cannot change the Owner');
select throws_ok($$ update public.organization_members set role = 'owner'
  where user_id = '10000000-0000-4000-8000-000000000005' $$, '42501', null, 'Admin cannot make an Owner');
select pg_temp.logout();

-- =============================================================================
-- my_permissions, and isolation between organizations
-- =============================================================================
select pg_temp.login('10000000-0000-4000-8000-000000000006');
select is(public.my_permissions('a0000000-0000-4000-8000-000000000001'),
  array['customers.view', 'fleet.view', 'loads.view'], 'Viewer''s own permissions');
select is(public.my_permissions('b0000000-0000-4000-8000-000000000001'), '{}'::text[],
  'no permissions in an organization you are not in');
select is(public.has_permission('b0000000-0000-4000-8000-000000000001', 'loads.view'), false,
  'has_permission is false in another organization');
select is((select count(*)::int from public.org_roles where organization_id = 'b0000000-0000-4000-8000-000000000001'), 0,
  'Org A member cannot read Org B roles');
select is((select count(*)::int from public.member_roles where organization_id = 'b0000000-0000-4000-8000-000000000001'), 0,
  'Org A member cannot read Org B role assignments');
select ok((select count(*) from public.org_roles) = 8, 'Org A member reads Org A roles');
select ok((select count(*) from public.permissions) > 0, 'signed-in users read the permission catalog');
select pg_temp.logout();

select pg_temp.login('10000000-0000-4000-8000-000000000001');
select throws_ok($$ insert into public.org_roles (organization_id, name, permissions)
  values ('a0000000-0000-4000-8000-000000000001', 'Custom', '{loads.view}') $$,
  '42501', null, 'roles cannot be written directly yet (not even by the Owner)');
select throws_ok($$ insert into public.org_roles (organization_id, name, permissions)
  values ('b0000000-0000-4000-8000-000000000001', 'Custom', '{loads.view}') $$,
  '42501', null, 'Org A owner cannot add a role to Org B');
select throws_ok($$ insert into public.member_roles (organization_id, user_id, role_id)
  select organization_id, '10000000-0000-4000-8000-000000000006', id from public.org_roles
  where organization_id = 'a0000000-0000-4000-8000-000000000001' and system_key = 'owner' $$,
  '42501', null, 'role assignments cannot be written directly');
select throws_ok($$ update public.permissions set label = 'x' $$, '42501', null, 'the catalog is read-only');
select pg_temp.logout();

-- A new organization gets its roles, and its creator the Owner role.
select pg_temp.login('20000000-0000-4000-8000-000000000001');
select lives_ok($$ select public.create_organization('Third Co') $$, 'create an organization');
select pg_temp.logout();
select is((select count(*)::int from public.org_roles r join public.organizations o on o.id = r.organization_id
           where o.name = 'Third Co'), 8, 'a new organization gets the eight built-in roles');
select is((select r.system_key from public.member_roles mr join public.org_roles r on r.id = mr.role_id
           join public.organizations o on o.id = mr.organization_id where o.name = 'Third Co'),
  'owner'::public.org_role, 'its creator gets the Owner role');

-- =============================================================================
-- Role rules (checked even for the database owner)
-- =============================================================================
select throws_ok($$ insert into public.org_roles (organization_id, name, permissions)
  values ('a0000000-0000-4000-8000-000000000001', 'Payroll', '{pay.edit}') $$,
  'P0001', '"Edit pay rules and deductions" needs "View driver pay, deductions and statements"',
  'a permission needs what it depends on');
select throws_ok($$ insert into public.org_roles (organization_id, name, permissions)
  values ('a0000000-0000-4000-8000-000000000001', 'Odd', '{loads.fly}') $$,
  '22023', 'Unknown permission: loads.fly', 'unknown permissions are rejected');
select lives_ok($$ insert into public.org_roles (organization_id, name, permissions)
  values ('a0000000-0000-4000-8000-000000000001', 'Payroll', '{pay.edit,pay.view,drivers.view,pay.view}') $$,
  'a custom role with complete permissions');
select is((select permissions from public.org_roles where name = 'Payroll'), array['drivers.view', 'pay.edit', 'pay.view'],
  'permissions are stored sorted, without duplicates');
select throws_ok($$ insert into public.org_roles (organization_id, name) values ('a0000000-0000-4000-8000-000000000001', ' payroll ') $$,
  '23505', null, 'role names are unique per organization, ignoring case and spaces');
select throws_ok($$ update public.org_roles set name = 'Boss' where system_key = 'owner'
  and organization_id = 'a0000000-0000-4000-8000-000000000001' $$,
  'P0001', 'The Owner role can''t be changed', 'the Owner role cannot be renamed');
select throws_ok($$ update public.org_roles set permissions = '{loads.view}' where system_key = 'owner'
  and organization_id = 'a0000000-0000-4000-8000-000000000001' $$,
  'P0001', 'The Owner role can''t be changed', 'the Owner role cannot get a permission list');
select throws_ok($$ delete from public.org_roles where system_key = 'viewer'
  and organization_id = 'a0000000-0000-4000-8000-000000000001' $$,
  'P0001', 'Built-in roles can''t be deleted', 'built-in roles cannot be deleted');
select throws_ok($$ update public.org_roles set system_key = 'admin' where name = 'Payroll' $$,
  '42501', null, 'a custom role cannot become a built-in one');
select lives_ok($$ update public.org_roles set permissions = '{loads.view,loads.edit}' where system_key = 'dispatcher'
  and organization_id = 'a0000000-0000-4000-8000-000000000001' $$, 'built-in roles other than Owner can be edited');
select ok((select count(*) from public.audit_logs where table_name = 'org_roles' and action = 'update') > 0,
  'role changes are audited');

select * from finish();
rollback;
