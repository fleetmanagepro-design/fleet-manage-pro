-- Tests for migration 0004 (loads, stops, drivers, accessorials, events). Run: npm run test:db
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
  (select id from public.customers where name = 'Northline Freight Brokerage') as a_customer,
  (select id from public.customers where name = 'Quickturn Freight Solutions') as a_dnu_customer,
  (select id from public.customers where name = 'Platte River Grain') as b_customer,
  (select id from public.trucks where organization_id = 'a0000000-0000-4000-8000-000000000001' and unit_number = '101') as a_truck,
  (select id from public.trucks where organization_id = 'b0000000-0000-4000-8000-000000000001' and unit_number = 'PH1') as b_truck,
  (select id from public.drivers where last_name = 'Carter') as a_driver,
  (select id from public.drivers where last_name = 'Hayes') as a_expired_driver,
  (select id from public.drivers where last_name = 'Bishop') as a_inactive_driver,
  (select id from public.loads where organization_id = 'b0000000-0000-4000-8000-000000000001' limit 1) as b_load,
  (select id from public.loads where organization_id = 'a0000000-0000-4000-8000-000000000001' and status = 'planned') as a_planned;
grant select on ids to authenticated;

create function pg_temp.stops() returns jsonb language sql as $$
  select '[{"stop_type":"pickup","city":"Joliet","state":"IL","timezone":"America/Chicago","appointment_start":"2026-12-01T14:00:00Z"},
           {"stop_type":"delivery","city":"Columbus","state":"OH","timezone":"America/New_York","appointment_start":"2026-12-02T14:00:00Z"}]'::jsonb;
$$;

-- Users: A owner 1000..01, admin ..02, dispatcher ..03, maintenance ..04, accounting ..05, viewer ..06; B owner 2000..01

-- =============================================================================
-- Isolation
-- =============================================================================
select set_config('role', 'anon', true);
select throws_ok($$ select * from public.loads $$, '42501', null, 'anon cannot read loads');
select pg_temp.logout();

select pg_temp.login('10000000-0000-4000-8000-000000000006'); -- A viewer
select is((select count(*)::int from public.loads), 64, 'Org A member sees only Org A loads');
select is((select count(*)::int from public.load_stops where organization_id = 'b0000000-0000-4000-8000-000000000001'), 0,
  'Org A cannot read Org B stops');
select is((select count(*)::int from public.load_events where organization_id = 'b0000000-0000-4000-8000-000000000001'), 0,
  'Org A cannot read Org B load history');
select pg_temp.logout();

select pg_temp.login('10000000-0000-4000-8000-000000000003'); -- A dispatcher
update public.loads set notes = 'hacked' where id = (select b_load from ids);
select throws_ok($$ select public.change_load_status((select b_load from ids), 'cancelled', 'x') $$,
  '42501', 'Load not found', 'Org A cannot change an Org B load status');
select throws_ok($$ insert into public.loads (organization_id, customer_id)
                    values ('b0000000-0000-4000-8000-000000000001', (select b_customer from ids)) $$,
  '42501', null, 'Org A cannot create a load in Org B');
select throws_ok($$ insert into public.loads (organization_id, customer_id)
                    values ('a0000000-0000-4000-8000-000000000001', (select b_customer from ids)) $$,
  '23503', null, 'a load cannot use another organization''s customer');
select throws_ok($$ select public.save_load(
                    jsonb_build_object('organization_id', 'a0000000-0000-4000-8000-000000000001',
                                       'customer_id', (select a_customer from ids), 'truck_id', (select b_truck from ids)),
                    pg_temp.stops(), '{}') $$,
  '23503', null, 'a load cannot use another organization''s truck');
select throws_ok($$ insert into public.load_stops (organization_id, load_id, sequence, stop_type, city, state, timezone)
                    values ('a0000000-0000-4000-8000-000000000001', (select b_load from ids), 9, 'pickup', 'X', 'IL', 'America/Chicago') $$,
  null, null, 'a stop cannot be added to another organization''s load');
select pg_temp.logout();
select is((select notes from public.loads where id = (select b_load from ids)), null, 'Org B load unchanged');

-- =============================================================================
-- Creating loads
-- =============================================================================
select pg_temp.login('10000000-0000-4000-8000-000000000004'); -- maintenance
select throws_ok($$ select public.save_load(
                    jsonb_build_object('organization_id', 'a0000000-0000-4000-8000-000000000001', 'customer_id', (select a_customer from ids)),
                    pg_temp.stops(), '{}') $$,
  '42501', null, 'maintenance cannot create loads');
select pg_temp.logout();

select pg_temp.login('10000000-0000-4000-8000-000000000003'); -- dispatcher
create temp table new_load (id uuid);
grant all on new_load to authenticated;
insert into new_load select public.save_load(
  jsonb_build_object('organization_id', 'a0000000-0000-4000-8000-000000000001', 'customer_id', (select a_customer from ids),
    'truck_id', (select a_truck from ids), 'linehaul_cents', 120000, 'fuel_surcharge_cents', 18000, 'loaded_miles', 355),
  pg_temp.stops(), array[(select a_driver from ids)]);
select is((select load_number from public.loads where id = (select id from new_load)), '1065', 'load number assigned automatically');
select is((select count(*)::int from public.load_stops where load_id = (select id from new_load)), 2, 'stops saved');
select is((select count(*)::int from public.load_drivers where load_id = (select id from new_load) and is_primary), 1, 'primary driver saved');
select is((select to_status::text from public.load_events where load_id = (select id from new_load)), 'planned', 'creation is in the history');

select throws_ok($$ insert into public.loads (organization_id, customer_id, status)
                    values ('a0000000-0000-4000-8000-000000000001', (select a_customer from ids), 'delivered') $$,
  '42501', null, 'status cannot be set directly on insert');
select throws_ok($$ update public.loads set status = 'delivered' where id = (select id from new_load) $$,
  '42501', null, 'status cannot be updated directly');
select throws_ok($$ select public.save_load(
                    jsonb_build_object('organization_id', 'a0000000-0000-4000-8000-000000000001',
                                       'customer_id', (select a_customer from ids), 'load_number', '1065'),
                    pg_temp.stops(), '{}') $$,
  '23505', null, 'load numbers are unique per organization');
select lives_ok($$ select public.save_load(
                   jsonb_build_object('organization_id', 'a0000000-0000-4000-8000-000000000001',
                                      'customer_id', (select a_customer from ids), 'load_number', 'LK-77'),
                   pg_temp.stops(), '{}') $$,
  'a load number can be entered by hand');
select throws_ok($$ select public.save_load(
                    jsonb_build_object('organization_id', 'a0000000-0000-4000-8000-000000000001', 'customer_id', (select a_dnu_customer from ids)),
                    pg_temp.stops(), '{}') $$,
  'P0001', 'This customer is marked do not use', 'a do-not-use customer cannot get a new load');
select throws_ok($$ select public.save_load(
                    jsonb_build_object('organization_id', 'a0000000-0000-4000-8000-000000000001', 'customer_id', (select a_customer from ids)),
                    pg_temp.stops(), array[(select a_expired_driver from ids)]) $$,
  'P0001', 'This driver''s CDL or medical card has expired', 'a driver with an expired CDL cannot be assigned');
select throws_ok($$ select public.save_load(
                    jsonb_build_object('organization_id', 'a0000000-0000-4000-8000-000000000001', 'customer_id', (select a_customer from ids)),
                    pg_temp.stops(), array[(select a_inactive_driver from ids)]) $$,
  'P0001', 'This driver is not active', 'an inactive driver cannot be assigned');
select throws_ok($$ select public.save_load(
                    jsonb_build_object('organization_id', 'a0000000-0000-4000-8000-000000000001', 'customer_id', (select a_customer from ids)),
                    '[{"stop_type":"pickup","city":"X","state":"IL","timezone":"Mars/Base"}]'::jsonb, '{}') $$,
  '22023', null, 'stop time zones must be real');

-- =============================================================================
-- Status changes
-- =============================================================================
select throws_ok($$ select public.change_load_status((select id from public.loads where load_number = 'LK-77'), 'dispatched') $$,
  'P0001', 'Assign a truck and a driver and add a pickup and a delivery first', 'dispatching needs truck, driver, pickup and delivery');
select lives_ok($$ select public.change_load_status((select id from new_load), 'dispatched') $$, 'dispatch a ready load');
select lives_ok($$ select public.change_load_status((select id from new_load), 'in_transit') $$, 'skip forward to in transit');
select throws_ok($$ select public.change_load_status((select id from new_load), 'dispatched') $$,
  'P0001', 'A reason is required', 'moving back needs a reason');
select lives_ok($$ select public.change_load_status((select id from new_load), 'dispatched', 'Clicked in transit by mistake') $$,
  'dispatcher can move back with a reason');
select throws_ok($$ select public.change_load_status((select id from new_load), 'delivered') $$,
  'P0001', 'Delivered needs the delivery time and loaded miles', 'delivered needs a delivery time');
select lives_ok($$ select public.change_load_status((select id from new_load), 'delivered', null, now(), 362.5, 40) $$,
  'deliver with time and miles');
select is((select loaded_miles from public.loads where id = (select id from new_load)), 362.5::numeric(10,1), 'delivered miles saved');
select throws_ok($$ select public.change_load_status((select id from new_load), 'invoiced') $$,
  'P0001', 'Invoicing is not available yet', 'invoiced is not available yet');
select throws_ok($$ select public.change_load_status((select id from new_load), 'cancelled', 'x') $$,
  'P0001', null, 'a delivered load cannot be cancelled directly');
select lives_ok($$ select public.change_load_status((select id from new_load), 'in_transit', 'Wrong load marked delivered') $$,
  'move a delivered load back with a reason');
select is((select delivered_at from public.loads where id = (select id from new_load)), null, 'moving back clears the delivery time');
select throws_ok($$ select public.change_load_status((select id from new_load), 'cancelled') $$,
  'P0001', 'A reason is required', 'cancelling needs a reason');
select lives_ok($$ select public.change_load_status((select id from new_load), 'cancelled', 'Broker cancelled') $$, 'cancel with a reason');
select is((select cancelled_reason from public.loads where id = (select id from new_load)), 'Broker cancelled', 'cancel reason saved');
select is((select count(*)::int from public.load_events where load_id = (select id from new_load) and kind = 'status_change'), 7,
  'every status change is in the history');
select throws_ok($$ select public.record_load_override((select id from new_load), 'Truck free earlier') $$,
  '42501', null, 'dispatcher cannot override the overlap warning');
select pg_temp.logout();

select pg_temp.login('10000000-0000-4000-8000-000000000002'); -- admin
select lives_ok($$ select public.record_load_override((select id from new_load), 'Truck free earlier') $$, 'admin can record an override');
select throws_ok($$ update public.load_events set reason = 'x' $$, '42501', null, 'load history cannot be edited');
select throws_ok($$ delete from public.loads where id = (select id from new_load) $$, '42501', null, 'loads cannot be deleted');
select pg_temp.logout();

select pg_temp.login('10000000-0000-4000-8000-000000000006'); -- viewer
select throws_ok($$ select public.change_load_status((select a_planned from ids), 'cancelled', 'x') $$,
  '42501', null, 'viewer cannot change load status');
select pg_temp.logout();

select * from finish();
rollback;
