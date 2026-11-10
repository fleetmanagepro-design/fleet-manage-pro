-- Tests for migration 0004b (assign_load). Run: npm run test:db
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

-- An unassigned planned load in Org A
insert into public.loads (organization_id, customer_id, load_number)
values ('a0000000-0000-4000-8000-000000000001', (select id from public.customers where name = 'Riverbend Foods'), 'UN-1');

create temp table ids as select
  (select id from public.loads where load_number = 'UN-1') as load,
  (select id from public.loads where organization_id = 'b0000000-0000-4000-8000-000000000001' limit 1) as b_load,
  (select id from public.trucks where organization_id = 'a0000000-0000-4000-8000-000000000001' and unit_number = '110') as truck,
  (select id from public.trucks where organization_id = 'b0000000-0000-4000-8000-000000000001' and unit_number = 'PH2') as b_truck,
  (select id from public.drivers where last_name = 'Myers') as driver,
  (select id from public.drivers where last_name = 'Hayes') as expired_driver;
grant select on ids to authenticated;

select pg_temp.login('10000000-0000-4000-8000-000000000003'); -- dispatcher
select lives_ok($$ select public.assign_load((select load from ids), (select truck from ids), null, array[(select driver from ids)]) $$,
  'dispatcher assigns a truck and a driver');
select is((select truck_id from public.loads where id = (select load from ids)), (select truck from ids), 'truck saved');
select is((select count(*)::int from public.load_drivers where load_id = (select load from ids) and is_primary), 1, 'driver saved as primary');
select throws_ok($$ select public.assign_load((select load from ids), null, null, array[(select expired_driver from ids)]) $$,
  'P0001', 'This driver''s CDL or medical card has expired', 'expired driver is refused');
select throws_ok($$ select public.assign_load((select load from ids), (select b_truck from ids), null, '{}') $$,
  '23503', null, 'another organization''s truck is refused');
select throws_ok($$ select public.assign_load((select b_load from ids), (select truck from ids), null, '{}') $$,
  '42501', 'Load not found', 'another organization''s load is refused');
select lives_ok($$ select public.assign_load((select load from ids), null, null, '{}') $$, 'assignment can be cleared');
select is((select count(*)::int from public.load_drivers where load_id = (select load from ids)), 0, 'drivers cleared');
select pg_temp.logout();

select pg_temp.login('10000000-0000-4000-8000-000000000006'); -- viewer
select throws_ok($$ select public.assign_load((select load from ids), (select truck from ids), null, '{}') $$,
  '42501', null, 'viewer cannot assign');
select pg_temp.logout();

select * from finish();
rollback;
