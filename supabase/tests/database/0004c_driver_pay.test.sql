-- Tests for migration 0004c (driver extras, deductions). Run: npm run test:db
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

create temp table ids as select
  (select l.id from public.loads l where l.load_number = '1061') as load,
  (select driver_id from public.load_drivers ld join public.loads l on l.id = ld.load_id where l.load_number = '1061' limit 1) as load_driver,
  (select id from public.drivers where last_name = 'Coleman') as other_driver,
  (select id from public.drivers where last_name = 'Long') as owner_op,
  (select id from public.drivers where organization_id = 'b0000000-0000-4000-8000-000000000001' limit 1) as b_driver;
grant select on ids to authenticated;

-- Driver extras ----------------------------------------------------------------
select pg_temp.login('10000000-0000-4000-8000-000000000003'); -- dispatcher
select lives_ok($$ insert into public.load_driver_items (organization_id, load_id, driver_id, description, amount_cents)
                   values ('a0000000-0000-4000-8000-000000000001', (select load from ids), (select load_driver from ids), 'Unloaded', 10000) $$,
  'dispatcher records a driver extra');
select throws_ok($$ insert into public.load_driver_items (organization_id, load_id, driver_id, description, amount_cents)
                    values ('a0000000-0000-4000-8000-000000000001', (select load from ids), (select other_driver from ids), 'Unloaded', 10000) $$,
  'P0001', 'This driver is not on the load', 'the driver must be on the load');
select throws_ok($$ insert into public.load_driver_items (organization_id, load_id, driver_id, description, amount_cents)
                    values ('a0000000-0000-4000-8000-000000000001', (select load from ids), (select b_driver from ids), 'X', 100) $$,
  'P0001', 'This driver is not on the load', 'another organization''s driver is refused (without revealing it)');
select is((select count(*)::int from public.driver_deductions), 0, 'dispatcher cannot see deductions');
select pg_temp.logout();

select pg_temp.login('10000000-0000-4000-8000-000000000006'); -- viewer
select is((select count(*)::int from public.load_driver_items), 0, 'viewer cannot see driver extras');
select pg_temp.logout();

select pg_temp.login('20000000-0000-4000-8000-000000000001'); -- Org B owner
select is((select count(*)::int from public.load_driver_items where organization_id = 'a0000000-0000-4000-8000-000000000001'), 0,
  'Org B cannot see Org A driver extras');
select is((select count(*)::int from public.driver_deductions where organization_id = 'a0000000-0000-4000-8000-000000000001'), 0,
  'Org B cannot see Org A deductions');
select pg_temp.logout();

-- Deductions ---------------------------------------------------------------------
select pg_temp.login('10000000-0000-4000-8000-000000000005'); -- accounting
select is((select count(*)::int from public.driver_deductions), 3, 'accounting sees deductions');
select lives_ok($$ insert into public.driver_deductions (organization_id, driver_id, name, kind, amount_cents, starts_on)
                   values ('a0000000-0000-4000-8000-000000000001', (select owner_op from ids), 'Fuel card fee', 'fixed_weekly', 1500, current_date) $$,
  'accounting adds a fixed weekly deduction');
select throws_ok($$ insert into public.driver_deductions (organization_id, driver_id, name, kind, percent, amount_cents, starts_on)
                    values ('a0000000-0000-4000-8000-000000000001', (select owner_op from ids), 'Bad', 'percent_of_gross', 10, 100, current_date) $$,
  '23514', null, 'a percent deduction cannot also have an amount');
select lives_ok($$ update public.driver_deductions set ends_on = current_date where name = 'Fuel card fee' $$, 'a deduction can be ended');
select throws_ok($$ update public.driver_deductions set percent = 50 where name = 'Truck rent' $$, '42501', null,
  'a deduction''s amount cannot be changed (end it and add a new one)');
select throws_ok($$ delete from public.driver_deductions where name = 'Truck rent' $$, '42501', null, 'deductions cannot be deleted');
select pg_temp.logout();

select pg_temp.login('10000000-0000-4000-8000-000000000003'); -- dispatcher
select throws_ok($$ insert into public.driver_deductions (organization_id, driver_id, name, kind, amount_cents, starts_on)
                    values ('a0000000-0000-4000-8000-000000000001', (select owner_op from ids), 'X', 'fixed_weekly', 100, current_date) $$,
  '42501', null, 'dispatcher cannot add deductions');
select pg_temp.logout();

select * from finish();
rollback;
