-- Tests for migration 0003b (drivers, pay rules). Run: npm run test:db
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

create temp table ids as
select
  (select id from public.drivers where organization_id = 'a0000000-0000-4000-8000-000000000001' and last_name = 'Carter') as a_driver,
  (select id from public.drivers where organization_id = 'b0000000-0000-4000-8000-000000000001' and last_name = 'Olsen') as b_driver,
  (select id from public.trucks where organization_id = 'b0000000-0000-4000-8000-000000000001' and unit_number = 'PH1') as b_truck,
  (select r.id from public.driver_pay_rules r join public.drivers d on d.id = r.driver_id
    where d.last_name = 'Carter' and r.effective_from > current_date) as a_future_rule,
  (select r.id from public.driver_pay_rules r join public.drivers d on d.id = r.driver_id
    where d.last_name = 'Carter' and r.effective_from <= current_date order by r.effective_from desc limit 1) as a_current_rule;
grant select on ids to authenticated;

-- Users: A owner 1000..01, admin ..02, dispatcher ..03, maintenance ..04, accounting ..05, viewer ..06; B owner 2000..01

-- =============================================================================
-- Read access by role
-- =============================================================================
select set_config('role', 'anon', true);
select throws_ok($$ select * from public.drivers $$, '42501', null, 'anon cannot read drivers');
select pg_temp.logout();

select pg_temp.login('10000000-0000-4000-8000-000000000003'); -- dispatcher
select is((select count(*)::int from public.drivers), 14, 'dispatcher sees Org A drivers');
select is((select count(*)::int from public.driver_pay_rules), 0, 'dispatcher sees no pay rules');
select pg_temp.logout();

select pg_temp.login('10000000-0000-4000-8000-000000000004'); -- maintenance
select is((select count(*)::int from public.drivers), 14, 'maintenance sees Org A drivers');
select is((select count(*)::int from public.driver_pay_rules), 0, 'maintenance sees no pay rules');
select pg_temp.logout();

select pg_temp.login('10000000-0000-4000-8000-000000000006'); -- viewer
select is((select count(*)::int from public.drivers), 0, 'viewer sees no drivers');
select is((select count(*)::int from public.driver_pay_rules), 0, 'viewer sees no pay rules');
select pg_temp.logout();

select pg_temp.login('10000000-0000-4000-8000-000000000005'); -- accounting
select ok((select count(*) from public.driver_pay_rules) > 0, 'accounting sees pay rules');
select is((select count(*)::int from public.driver_pay_rules
           where organization_id = 'b0000000-0000-4000-8000-000000000001'), 0, 'accounting cannot see Org B pay');
select pg_temp.logout();

-- =============================================================================
-- Tenant isolation
-- =============================================================================
select pg_temp.login('10000000-0000-4000-8000-000000000001'); -- A owner
select is((select count(*)::int from public.drivers where organization_id = 'b0000000-0000-4000-8000-000000000001'), 0,
  'Org A cannot read Org B drivers');
update public.drivers set phone = 'hacked' where id = (select b_driver from ids);
select throws_ok($$ insert into public.drivers (organization_id, first_name, last_name)
                    values ('b0000000-0000-4000-8000-000000000001', 'X', 'Y') $$,
  '42501', null, 'Org A cannot add a driver to Org B');
select throws_ok($$ insert into public.driver_pay_rules (organization_id, driver_id, effective_from, pay_type, flat_cents)
                    values ('b0000000-0000-4000-8000-000000000001', (select b_driver from ids), current_date, 'flat', 100) $$,
  '42501', null, 'Org A cannot add a pay rule in Org B');
select throws_ok($$ insert into public.driver_pay_rules (organization_id, driver_id, effective_from, pay_type, flat_cents)
                    values ('a0000000-0000-4000-8000-000000000001', (select b_driver from ids), current_date, 'flat', 100) $$,
  '23503', null, 'a pay rule cannot point at another organization''s driver');
select throws_ok($$ update public.drivers set default_truck_id = (select b_truck from ids) where id = (select a_driver from ids) $$,
  '23503', null, 'a driver cannot get another organization''s truck');
select pg_temp.logout();
select is((select phone from public.drivers where id = (select b_driver from ids)), '(308) 555-011', 'Org B driver unchanged');

select pg_temp.login('20000000-0000-4000-8000-000000000001'); -- B owner
select is((select count(*)::int from public.drivers), 3, 'Org B sees its 3 drivers');
select is((select count(*)::int from public.driver_pay_rules where organization_id = 'a0000000-0000-4000-8000-000000000001'), 0,
  'Org B cannot read Org A pay');
delete from public.driver_pay_rules where id = (select a_future_rule from ids);
select pg_temp.logout();
select is((select count(*)::int from public.driver_pay_rules where id = (select a_future_rule from ids)), 1,
  'Org B cannot delete Org A pay rule');

-- =============================================================================
-- Write access by role
-- =============================================================================
select pg_temp.login('10000000-0000-4000-8000-000000000003'); -- dispatcher
select throws_ok($$ insert into public.drivers (organization_id, first_name, last_name)
                    values ('a0000000-0000-4000-8000-000000000001', 'D', 'X') $$,
  '42501', null, 'dispatcher cannot add drivers');
update public.drivers set phone = 'dispatch edit' where id = (select a_driver from ids);
select pg_temp.logout();
select isnt((select phone from public.drivers where id = (select a_driver from ids)), 'dispatch edit', 'dispatcher cannot edit drivers');

select pg_temp.login('10000000-0000-4000-8000-000000000005'); -- accounting
select lives_ok($$ insert into public.drivers (organization_id, first_name, last_name, cdl_number, cdl_state, cdl_class)
                   values ('a0000000-0000-4000-8000-000000000001', 'New', 'Hire', 'z123', 'IL', 'A') $$,
  'accounting can add a driver');
select throws_ok($$ insert into public.drivers (organization_id, first_name, last_name, cdl_number, cdl_state)
                    values ('a0000000-0000-4000-8000-000000000001', 'Dup', 'Licensed', 'Z123', 'IL') $$,
  '23505', null, 'a CDL number is unique per state among active drivers');
select throws_ok($$ insert into public.drivers (organization_id, first_name, last_name, cdl_number)
                    values ('a0000000-0000-4000-8000-000000000001', 'No', 'State', 'Q1') $$,
  '23514', null, 'a CDL number needs its state');
select throws_ok($$ delete from public.drivers where last_name = 'Hire' $$, '42501', null, 'drivers cannot be deleted');
update public.drivers set archived_at = now() where last_name = 'Hire';
select pg_temp.logout();
select is((select archived_by from public.drivers where last_name = 'Hire'), '10000000-0000-4000-8000-000000000005'::uuid,
  'archived_by records who archived');

-- =============================================================================
-- Pay rules: shape and history
-- =============================================================================
select pg_temp.login('10000000-0000-4000-8000-000000000005'); -- accounting
select throws_ok($$ insert into public.driver_pay_rules (organization_id, driver_id, effective_from, pay_type, rate_cents_per_mile)
                    values ('a0000000-0000-4000-8000-000000000001', (select a_driver from ids), current_date + 100, 'per_mile', 60) $$,
  '23514', null, 'per-mile rule needs its miles basis');
select throws_ok($$ insert into public.driver_pay_rules (organization_id, driver_id, effective_from, pay_type, percent, percent_basis, flat_cents)
                    values ('a0000000-0000-4000-8000-000000000001', (select a_driver from ids), current_date + 100, 'percent', 25, 'linehaul', 100) $$,
  '23514', null, 'a percent rule cannot also carry a flat amount');
select throws_ok($$ insert into public.driver_pay_rules (organization_id, driver_id, effective_from, pay_type, percent, percent_basis)
                    values ('a0000000-0000-4000-8000-000000000001', (select a_driver from ids), current_date + 100, 'percent', 120, 'linehaul') $$,
  '23514', null, 'percent is at most 100');
select throws_ok($$ insert into public.driver_pay_rules (organization_id, driver_id, effective_from, pay_type, flat_cents)
                    values ('a0000000-0000-4000-8000-000000000001', (select a_driver from ids),
                            (select effective_from from public.driver_pay_rules where id = (select a_future_rule from ids)), 'flat', 100) $$,
  '23505', null, 'one rule per driver per effective date');

select throws_ok($$ update public.driver_pay_rules set rate_cents_per_mile = 99 where id = (select a_current_rule from ids) $$,
  'P0001', null, 'a rule in effect cannot be changed');
select throws_ok($$ delete from public.driver_pay_rules where id = (select a_current_rule from ids) $$,
  'P0001', null, 'a rule in effect cannot be deleted');
select throws_ok($$ update public.driver_pay_rules set effective_from = current_date where id = (select a_future_rule from ids) $$,
  'P0001', null, 'a future rule cannot be moved into the past');
select lives_ok($$ update public.driver_pay_rules set rate_cents_per_mile = 61 where id = (select a_future_rule from ids) $$,
  'a future rule can be changed');
select lives_ok($$ insert into public.driver_pay_rules (organization_id, driver_id, effective_from, pay_type, rate_cents_per_mile, miles_basis)
                   values ('a0000000-0000-4000-8000-000000000001', (select a_driver from ids), current_date, 'per_mile', 59, 'loaded') $$,
  'a new rule starting today can be added');
select lives_ok($$ delete from public.driver_pay_rules where id = (select a_future_rule from ids) $$, 'a future rule can be deleted');
select pg_temp.logout();

select ok((select count(*) > 0 from public.audit_logs where table_name = 'driver_pay_rules' and action = 'delete'
           and actor_id = '10000000-0000-4000-8000-000000000005'), 'pay rule deletion is audited');

select pg_temp.login('10000000-0000-4000-8000-000000000003'); -- dispatcher
select throws_ok($$ insert into public.driver_pay_rules (organization_id, driver_id, effective_from, pay_type, flat_cents)
                    values ('a0000000-0000-4000-8000-000000000001', (select a_driver from ids), current_date + 5, 'flat', 100) $$,
  '42501', null, 'dispatcher cannot add pay rules');
select pg_temp.logout();

select * from finish();
rollback;
