-- Roles and permissions (migration 0009). Run: npm run test:db
-- Relies on supabase/seed.sql: Org A (Lakeside) owner ..01, admin ..02, dispatcher ..03, maintenance ..04,
-- accounting ..05, viewer ..06, fleet director ..07, fleet manager ..08; Org B (Prairie Haul) owner 2000..01.
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

-- Seeded: Fleet Director ..07 and Fleet Manager ..08 in Org A.

-- Role id of a built-in role; a member's built-in roles (read as the database owner).
create function pg_temp.rid(k public.org_role, org uuid default 'a0000000-0000-4000-8000-000000000001')
returns uuid language sql security definer as $$
  select id from public.org_roles where organization_id = org and system_key = k;
$$;
create function pg_temp.roles_of(uid uuid, org uuid default 'a0000000-0000-4000-8000-000000000001')
returns text[] language sql security definer as $$
  select coalesce(array_agg(r.name order by r.name), '{}') from public.member_roles mr
  join public.org_roles r on r.id = mr.role_id where mr.organization_id = org and mr.user_id = uid;
$$;
create function pg_temp.perms(uid uuid) returns text[] language sql security definer as $$
  select public.member_permissions('a0000000-0000-4000-8000-000000000001', uid);
$$;
grant execute on function pg_temp.rid(public.org_role, uuid), pg_temp.roles_of(uuid, uuid), pg_temp.perms(uuid) to authenticated;

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
           where not exists (select 1 from public.member_roles mr
                             where mr.organization_id = m.organization_id and mr.user_id = m.user_id)), 0,
  'every member has a role');
select hasnt_column('public', 'organization_members', 'role', 'members no longer carry a single role');
select hasnt_column('public', 'invitations', 'role', 'invitations no longer carry a single role');

-- No policy or function still decides by a list of roles.
select is((select count(*)::int from pg_policies
           where coalesce(qual, '') ~ 'has_org_role' or coalesce(with_check, '') ~ 'has_org_role'), 0,
  'no RLS policy uses has_org_role');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prosrc ~ 'has_org_role'), 0,
  'no function uses has_org_role');
select hasnt_function('public', 'has_org_role', 'has_org_role is gone');

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

select is(public.member_permissions(mr.organization_id, mr.user_id),
          (select coalesce(array_agg(e.key order by e.key), '{}') from expected e where r.system_key = any (e.roles)),
          r.system_key || ' keeps the same rights')
from public.member_roles mr join public.org_roles r on r.id = mr.role_id
where mr.organization_id = 'a0000000-0000-4000-8000-000000000001' and r.system_key not in ('fleet_director', 'fleet_manager');

-- Fleet Director and Fleet Manager follow the approved table.
select is(pg_temp.perms('10000000-0000-4000-8000-000000000007'),
  array['customers.edit', 'customers.view', 'dashboard.pay', 'documents.add', 'documents.remove', 'drivers.edit',
        'drivers.view', 'fleet.edit', 'fleet.status', 'fleet.view', 'loads.edit', 'loads.override', 'loads.view',
        'members.manage', 'pay.edit', 'pay.finalize', 'pay.view'],
  'Fleet Director permissions');
select is(pg_temp.perms('10000000-0000-4000-8000-000000000008'),
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
select throws_ok($$ select public.create_invitation('a0000000-0000-4000-8000-000000000001', 'x@example.test', array[pg_temp.rid('viewer')], repeat('b', 64)) $$,
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

select lives_ok($$ select public.create_invitation('a0000000-0000-4000-8000-000000000001', 'fm@example.test', array[pg_temp.rid('fleet_manager')], repeat('c', 64)) $$,
  'Fleet Director can invite a Fleet Manager');
select throws_ok($$ select public.create_invitation('a0000000-0000-4000-8000-000000000001', 'ad@example.test', array[pg_temp.rid('admin')], repeat('d', 64)) $$,
  '42501', null, 'Fleet Director cannot invite an Admin (more rights than their own)');
select throws_ok($$ select public.create_invitation('a0000000-0000-4000-8000-000000000001', 'ow@example.test', array[pg_temp.rid('owner')], repeat('e', 64)) $$,
  '42501', null, 'Fleet Director cannot invite an Owner');

-- dispatcher ..03 → fleet manager: allowed
select lives_ok($$ select public.set_member_roles('a0000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003', array[pg_temp.rid('fleet_manager')]) $$, 'Fleet Director can make a Dispatcher a Fleet Manager');
select is(pg_temp.roles_of('10000000-0000-4000-8000-000000000003'), array['Fleet Manager'], 'the Dispatcher is now a Fleet Manager');
select throws_ok($$ select public.set_member_roles('a0000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003', array[pg_temp.rid('admin')]) $$,
  '42501', null, 'Fleet Director cannot make someone an Admin');
select throws_ok($$ select public.set_member_roles('a0000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', array[pg_temp.rid('viewer')]) $$,
  '42501', null, 'Fleet Director cannot change an Admin');
with d as (delete from public.organization_members where user_id = '10000000-0000-4000-8000-000000000002' returning 1)
select is((select count(*)::int from d), 0, 'Fleet Director cannot remove an Admin');
-- maintenance ..04 has fleet.edit... and nothing the director lacks: may be removed
with d as (delete from public.organization_members where user_id = '10000000-0000-4000-8000-000000000004' returning 1)
select is((select count(*)::int from d), 1, 'Fleet Director can remove a member with fewer rights');
select pg_temp.logout();

-- Accounting has nothing beyond the director either, but the director can't touch the Owner.
select pg_temp.login('10000000-0000-4000-8000-000000000007');
select throws_ok($$ select public.set_member_roles('a0000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', array[pg_temp.rid('viewer')]) $$, '42501', null, 'Fleet Director cannot change the Owner');
select pg_temp.logout();

-- Admin still manages everyone but the Owner.
select pg_temp.login('10000000-0000-4000-8000-000000000002');
select lives_ok($$ select public.set_member_roles('a0000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000007', array[pg_temp.rid('dispatcher'), pg_temp.rid('accounting')]) $$, 'Admin can give a member two roles');
select is(pg_temp.roles_of('10000000-0000-4000-8000-000000000007'), array['Accounting', 'Dispatcher'], 'the member has both roles');
select is(pg_temp.perms('10000000-0000-4000-8000-000000000007'),
  array['customers.edit', 'customers.view', 'dashboard.pay', 'documents.add', 'drivers.edit', 'drivers.view', 'fleet.status',
        'fleet.view', 'loads.edit', 'loads.view', 'pay.edit', 'pay.finalize', 'pay.view'],
  'two roles give everything either allows');
select throws_ok($$ select public.set_member_roles('a0000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000007', '{}') $$, 'P0001', 'A member needs at least one role', 'a member keeps at least one role');
select throws_ok($$ select public.set_member_roles('a0000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', array[pg_temp.rid('viewer')]) $$, '42501', null, 'Admin cannot change the Owner');
select throws_ok($$ select public.set_member_roles('a0000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000005', array[pg_temp.rid('owner')]) $$, '42501', null, 'Admin cannot make an Owner');
select throws_ok($$ select public.set_member_roles('a0000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000005', array[pg_temp.rid('viewer', 'b0000000-0000-4000-8000-000000000001')]) $$,
  '42501', null, 'a role from another organization cannot be given');
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
  '42501', null, 'roles cannot be written directly, only through the role functions');
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

-- =============================================================================
-- Roles the company makes (0009c): create, edit, reset, delete
-- =============================================================================
select pg_temp.login('10000000-0000-4000-8000-000000000007'); -- Fleet Director (now Dispatcher + Accounting)
select throws_ok($$ select public.create_role('a0000000-0000-4000-8000-000000000001', 'Night dispatch', null, '{loads.view,loads.edit}') $$,
  '42501', null, 'without "manage members and roles" no roles can be made');
select pg_temp.logout();

select pg_temp.login('10000000-0000-4000-8000-000000000002'); -- Admin
select lives_ok($$ select public.create_role('a0000000-0000-4000-8000-000000000001', 'Night dispatch', 'Weekend and nights',
  '{loads.view,loads.edit,drivers.view}') $$, 'an admin creates a role by ticking permissions');
select throws_ok($$ select public.create_role('a0000000-0000-4000-8000-000000000001', 'Broken', null, '{loads.edit}') $$,
  'P0001', '"Create and edit loads and dispatch" needs "View loads and the dispatch board"', 'permissions need what they depend on');
select throws_ok($$ select public.create_role('b0000000-0000-4000-8000-000000000001', 'Spy', null, '{loads.view}') $$,
  '42501', null, 'no roles in another organization');
select lives_ok($$ select public.set_member_roles('a0000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000006',
  array[(select id from public.org_roles where name = 'Night dispatch')]) $$, 'the new role can be given');
select is(pg_temp.perms('10000000-0000-4000-8000-000000000006'),
  array['drivers.view', 'loads.edit', 'loads.view'], 'the member gets exactly what the role allows');
select lives_ok($$ select public.update_role((select id from public.org_roles where name = 'Night dispatch'), 'Night dispatch',
  null, '{loads.view,loads.edit,drivers.view,customers.view}') $$, 'a custom role can be edited');
select is(pg_temp.perms('10000000-0000-4000-8000-000000000006'),
  array['customers.view', 'drivers.view', 'loads.edit', 'loads.view'], 'editing a role changes its members'' rights at once');
select throws_ok($$ select public.delete_role((select id from public.org_roles where name = 'Night dispatch')) $$,
  'P0001', null, 'a role someone has cannot be deleted');
select lives_ok($$ select public.update_role(pg_temp.rid('viewer'), 'Renamed viewer', 'Read-only', '{loads.view,fleet.view}') $$,
  'a built-in role can be edited');
select is((select name from public.org_roles where id = pg_temp.rid('viewer')), 'Viewer', 'built-in roles keep their name');
select lives_ok($$ select public.reset_role(pg_temp.rid('viewer')) $$, 'a built-in role can be reset');
select is((select permissions from public.org_roles where id = pg_temp.rid('viewer')),
  array['customers.view', 'fleet.view', 'loads.view'], 'reset puts back the original permissions');
select throws_ok($$ select public.update_role(pg_temp.rid('owner'), 'Owner', null, '{}') $$,
  'P0001', 'The Owner role can''t be changed', 'the Owner role cannot be edited');
select throws_ok($$ select public.delete_role(pg_temp.rid('viewer')) $$, 'P0001', 'Built-in roles can''t be deleted',
  'built-in roles cannot be deleted');
select lives_ok($$ select public.create_role('a0000000-0000-4000-8000-000000000001', 'Temp', null, '{loads.view}') $$, 'another role');
select lives_ok($$ select public.delete_role((select id from public.org_roles where name = 'Temp')) $$, 'an unused custom role can be deleted');
select pg_temp.logout();

-- A manager with fewer rights can't edit, give or delete a role beyond them.
select pg_temp.login('10000000-0000-4000-8000-000000000002');
select public.set_member_roles('a0000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000008',
  array[pg_temp.rid('fleet_director')]);
select pg_temp.logout();
select pg_temp.login('10000000-0000-4000-8000-000000000008'); -- now a Fleet Director
select throws_ok($$ select public.create_role('a0000000-0000-4000-8000-000000000001', 'Too much', null, '{company.manage}') $$,
  '42501', null, 'nobody creates a role with permissions they don''t have');
select throws_ok($$ select public.update_role(pg_temp.rid('admin'), 'Admin', null, '{loads.view}') $$,
  '42501', null, 'nobody edits a role with more rights than their own');
select throws_ok($$ select public.update_role(pg_temp.rid('viewer'), 'Viewer', null, '{loads.view,company.manage}') $$,
  '42501', null, 'nobody adds a permission they don''t have to a role');
select lives_ok($$ select public.update_role(pg_temp.rid('viewer'), 'Viewer', null, '{loads.view,fleet.view,customers.view,drivers.view}') $$,
  'a Fleet Director can add a permission they have to a smaller role');
select pg_temp.logout();

-- Several roles in one invitation; accepting gives them all.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
values ('00000000-0000-0000-0000-000000000000', '30000000-0000-4000-8000-000000000009', 'authenticated',
  'authenticated', 'two.roles@example.test', '', now(), now(), now(), '', '', '', '');
select pg_temp.login('10000000-0000-4000-8000-000000000002');
select lives_ok($$ select public.create_invitation('a0000000-0000-4000-8000-000000000001', 'Two.Roles@example.test',
  array[pg_temp.rid('dispatcher'), pg_temp.rid('maintenance')], encode(extensions.digest('tok-two', 'sha256'), 'hex')) $$,
  'an invitation can give several roles');
select pg_temp.logout();
select pg_temp.login('30000000-0000-4000-8000-000000000009');
select lives_ok($$ select public.accept_invitation('tok-two') $$, 'the invitation is accepted');
select pg_temp.logout();
select is(pg_temp.roles_of('30000000-0000-4000-8000-000000000009'), array['Dispatcher', 'Maintenance'],
  'accepting gives every role of the invitation');

select * from finish();
rollback;
