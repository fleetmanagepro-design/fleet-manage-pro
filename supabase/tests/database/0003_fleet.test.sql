-- Tests for migration 0003 (trucks, trailers, odometer readings). Run: npm run test:db
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

-- Fixture ids
create temp table ids as
select
  (select id from public.trucks where organization_id = 'a0000000-0000-4000-8000-000000000001' and unit_number = '101') as a_truck,
  (select id from public.trucks where organization_id = 'b0000000-0000-4000-8000-000000000001' and unit_number = 'PH1') as b_truck,
  (select id from public.trailers where organization_id = 'a0000000-0000-4000-8000-000000000001' and unit_number = '5301') as a_dry_van,
  (select id from public.trailers where organization_id = 'a0000000-0000-4000-8000-000000000001' and unit_number = '5311') as a_reefer,
  (select id from public.trailers where organization_id = 'b0000000-0000-4000-8000-000000000001' and unit_number = 'PHT1') as b_trailer;
grant select on ids to authenticated;

-- Users: A owner 1000..01, A admin ..02, A dispatcher ..03, A maintenance ..04, A viewer ..06, B owner 2000..01

-- =============================================================================
-- Tenant isolation
-- =============================================================================
select set_config('role', 'anon', true);
select throws_ok($$ select * from public.trucks $$, '42501', null, 'anon cannot read trucks');
select pg_temp.logout();

select pg_temp.login('10000000-0000-4000-8000-000000000004'); -- A maintenance
select is((select count(*)::int from public.trucks), 12, 'Org A sees its 12 trucks only');
select is((select count(*)::int from public.trailers), 18, 'Org A sees its 18 trailers only');
select is((select count(*)::int from public.odometer_readings
           where organization_id = 'b0000000-0000-4000-8000-000000000001'), 0, 'Org A cannot read Org B readings');

update public.trucks set notes = 'hacked' where id = (select b_truck from ids);
update public.trailers set notes = 'hacked' where id = (select b_trailer from ids);
select throws_ok($$ insert into public.trucks (organization_id, unit_number, vin)
                    values ('b0000000-0000-4000-8000-000000000001', 'X1', '1FUJHHDR8JP000001') $$,
  '42501', null, 'Org A cannot insert a truck into Org B');
select throws_ok($$ insert into public.odometer_readings (organization_id, asset_type, truck_id, reading, reading_type)
                    values ('b0000000-0000-4000-8000-000000000001', 'truck', (select b_truck from ids), 999999, 'odometer') $$,
  '42501', null, 'Org A cannot add a reading to an Org B truck');
select throws_ok($$ insert into public.odometer_readings (organization_id, asset_type, truck_id, reading, reading_type)
                    values ('a0000000-0000-4000-8000-000000000001', 'truck', (select b_truck from ids), 999999, 'odometer') $$,
  '23503', null, 'a reading cannot point at another organization''s truck');
select pg_temp.logout();

select is((select notes from public.trucks where id = (select b_truck from ids)), null, 'Org B truck unchanged');
select is((select notes from public.trailers where id = (select b_trailer from ids)), null, 'Org B trailer unchanged');

select pg_temp.login('20000000-0000-4000-8000-000000000001'); -- B owner
select is((select count(*)::int from public.trucks), 3, 'Org B sees its 3 trucks only');
update public.trucks set notes = 'hacked' where id = (select a_truck from ids);
select pg_temp.logout();
select is((select notes from public.trucks where id = (select a_truck from ids)), null, 'Org A truck unchanged by Org B');

-- =============================================================================
-- Roles
-- =============================================================================
select pg_temp.login('10000000-0000-4000-8000-000000000006'); -- viewer
select throws_ok($$ insert into public.trucks (organization_id, unit_number, vin)
                    values ('a0000000-0000-4000-8000-000000000001', 'V1', '1FUJHHDR8JP000002') $$,
  '42501', null, 'viewer cannot add trucks');
update public.trucks set status = 'in_shop' where id = (select a_truck from ids);
select pg_temp.logout();
select is((select status::text from public.trucks where id = (select a_truck from ids)), 'active', 'viewer cannot change status');

select pg_temp.login('10000000-0000-4000-8000-000000000003'); -- dispatcher
select throws_ok($$ insert into public.trucks (organization_id, unit_number, vin)
                    values ('a0000000-0000-4000-8000-000000000001', 'D1', '1FUJHHDR8JP000003') $$,
  '42501', null, 'dispatcher cannot add trucks');
select lives_ok($$ update public.trucks set status = 'in_shop' where id = (select a_truck from ids) $$,
  'dispatcher can change truck status');
select throws_ok($$ update public.trucks set plate = 'NEW1' where id = (select a_truck from ids) $$,
  '42501', 'Dispatchers can only change the status', 'dispatcher cannot change other truck fields');
select throws_ok($$ update public.trucks set archived_at = now() where id = (select a_truck from ids) $$,
  '42501', 'Dispatchers can only change the status', 'dispatcher cannot archive');
select throws_ok($$ update public.trucks set status = 'sold' where id = (select a_truck from ids) $$,
  '42501', 'Only an owner or admin can change a sold status', 'dispatcher cannot mark sold');
select lives_ok($$ update public.trailers set status = 'out_of_service' where id = (select a_dry_van from ids) $$,
  'dispatcher can change trailer status');
select throws_ok($$ insert into public.odometer_readings (organization_id, asset_type, truck_id, reading, reading_type)
                    values ('a0000000-0000-4000-8000-000000000001', 'truck', (select a_truck from ids), 999999, 'odometer') $$,
  '42501', null, 'dispatcher cannot record readings');
select pg_temp.logout();
select is((select status::text from public.trucks where id = (select a_truck from ids)), 'in_shop', 'status change persisted');

select pg_temp.login('10000000-0000-4000-8000-000000000004'); -- maintenance
select lives_ok($$ insert into public.trucks (organization_id, unit_number, vin, current_odometer, status)
                   values ('a0000000-0000-4000-8000-000000000001', '201', '1FUJHHDR8JP000004', 1000.5, 'active') $$,
  'maintenance can add a truck');
select throws_ok($$ insert into public.trucks (organization_id, unit_number, vin)
                    values ('a0000000-0000-4000-8000-000000000001', '201', '1FUJHHDR8JP000005') $$,
  '23505', null, 'unit number is unique among active trucks');
select throws_ok($$ insert into public.trucks (organization_id, unit_number, vin)
                    values ('a0000000-0000-4000-8000-000000000001', '202', '1FUJHHDR8JP000004') $$,
  '23505', null, 'VIN is unique among active trucks');
select lives_ok($$ insert into public.trailers (organization_id, unit_number, trailer_type)
                   values ('a0000000-0000-4000-8000-000000000001', '201', 'dry_van') $$,
  'a trailer may share a unit number with a truck');
select throws_ok($$ insert into public.trucks (organization_id, unit_number, vin)
                    values ('a0000000-0000-4000-8000-000000000001', '203', '1FUJHHDR8JP00000I') $$,
  '23514', null, 'VIN with I/O/Q is rejected');
select throws_ok($$ insert into public.trailers (organization_id, unit_number, trailer_type, reefer_hours)
                    values ('a0000000-0000-4000-8000-000000000001', '204', 'dry_van', 100) $$,
  '23514', null, 'reefer hours only on reefer trailers');
select throws_ok($$ update public.trucks set annual_inspection_valid_months = 5 where unit_number = '201' $$,
  '23514', null, 'inspection validity must be 3, 6, 9 or 12 months');
select lives_ok($$ update public.trucks set annual_inspection_valid_months = 6 where unit_number = '201' $$,
  'maintenance can set the inspection validity');
select throws_ok($$ update public.trucks set current_odometer = 1 where unit_number = '201' $$,
  '42501', null, 'current odometer is not directly writable');
select throws_ok($$ update public.trucks set status = 'sold' where unit_number = '201' $$,
  '42501', 'Only an owner or admin can change a sold status', 'maintenance cannot mark sold');
select throws_ok($$ delete from public.trucks where unit_number = '201' $$,
  '42501', null, 'trucks cannot be deleted');
update public.trucks set archived_at = now() where unit_number = '201';
select lives_ok($$ insert into public.trucks (organization_id, unit_number, vin)
                   values ('a0000000-0000-4000-8000-000000000001', '201', '1FUJHHDR8JP000004') $$,
  'archiving frees the unit number and VIN');
select pg_temp.logout();

select is((select count(*)::int from public.odometer_readings r join public.trucks t on t.id = r.truck_id
           where t.unit_number = '201' and t.archived_at is not null and r.note = 'Initial reading' and r.reading = 1000.5), 1,
  'the starting odometer becomes the first reading');
select is((select archived_by from public.trucks where unit_number = '201' and archived_at is not null),
  '10000000-0000-4000-8000-000000000004'::uuid, 'archived_by records who archived');

-- =============================================================================
-- Meter readings
-- =============================================================================
select pg_temp.login('10000000-0000-4000-8000-000000000004'); -- maintenance
select lives_ok($$ insert into public.odometer_readings (organization_id, asset_type, truck_id, reading, reading_type)
                   values ('a0000000-0000-4000-8000-000000000001', 'truck', (select a_truck from ids), 340000, 'odometer') $$,
  'a higher reading is accepted');
select is((select current_odometer from public.trucks where id = (select a_truck from ids)), 340000.0::numeric(10,1),
  'the truck odometer follows the reading');
select throws_ok($$ insert into public.odometer_readings (organization_id, asset_type, truck_id, reading, reading_type)
                    values ('a0000000-0000-4000-8000-000000000001', 'truck', (select a_truck from ids), 339999.9, 'odometer') $$,
  'P0001', null, 'a lower reading is rejected');
select throws_ok($$ insert into public.odometer_readings (organization_id, asset_type, truck_id, reading, reading_type, is_correction, note)
                    values ('a0000000-0000-4000-8000-000000000001', 'truck', (select a_truck from ids), 330000, 'odometer', true, 'typo') $$,
  '42501', 'Only an owner or admin can correct a reading', 'maintenance cannot correct a reading');
select throws_ok($$ insert into public.odometer_readings (organization_id, asset_type, trailer_id, reading, reading_type)
                    values ('a0000000-0000-4000-8000-000000000001', 'trailer', (select a_dry_van from ids), 10, 'reefer_hours') $$,
  '23514', null, 'reefer hours cannot be recorded for a dry van');
select lives_ok($$ insert into public.odometer_readings (organization_id, asset_type, trailer_id, reading, reading_type)
                   values ('a0000000-0000-4000-8000-000000000001', 'trailer', (select a_reefer from ids), 9000, 'reefer_hours') $$,
  'reefer hours recorded for a reefer');
select is((select reefer_hours from public.trailers where id = (select a_reefer from ids)), 9000.0::numeric(10,1),
  'trailer reefer hours follow the reading');
select throws_ok($$ update public.odometer_readings set reading = 1 $$, '42501', null, 'readings cannot be edited');
select throws_ok($$ delete from public.odometer_readings $$, '42501', null, 'readings cannot be deleted');
select pg_temp.logout();

select pg_temp.login('10000000-0000-4000-8000-000000000002'); -- admin
select throws_ok($$ insert into public.odometer_readings (organization_id, asset_type, truck_id, reading, reading_type, is_correction)
                    values ('a0000000-0000-4000-8000-000000000001', 'truck', (select a_truck from ids), 330000, 'odometer', true) $$,
  '23514', null, 'a correction requires a reason');
select lives_ok($$ insert into public.odometer_readings (organization_id, asset_type, truck_id, reading, reading_type, is_correction, note)
                   values ('a0000000-0000-4000-8000-000000000001', 'truck', (select a_truck from ids), 330000, 'odometer', true, 'Typed an extra digit') $$,
  'admin can correct a reading with a reason');
select is((select current_odometer from public.trucks where id = (select a_truck from ids)), 330000.0::numeric(10,1),
  'correction lowers the odometer');
select pg_temp.logout();

select ok((select count(*) > 0 from public.audit_logs
           where table_name = 'odometer_readings' and actor_id = '10000000-0000-4000-8000-000000000002'
             and new_data ->> 'is_correction' = 'true'), 'correction is in the audit log');
select ok((select count(*) > 0 from public.audit_logs
           where table_name = 'trucks' and record_id = (select a_truck from ids)
             and (old_data ->> 'current_odometer')::numeric = 340000 and (new_data ->> 'current_odometer')::numeric = 330000),
  'odometer change on the truck is in the audit log');
select throws_ok($$ update public.trucks set current_odometer = 1 where id = (select a_truck from ids) $$,
  'P0001', 'Meter readings can only increase', 'even a superuser cannot lower the odometer outside a correction');

-- =============================================================================
-- Sold is read-only
-- =============================================================================
select pg_temp.login('10000000-0000-4000-8000-000000000001'); -- owner
select lives_ok($$ update public.trucks set status = 'sold' where id = (select a_truck from ids) $$, 'owner can mark sold');
select throws_ok($$ update public.trucks set plate = 'SOLD1' where id = (select a_truck from ids) $$,
  'P0001', 'A sold asset is read-only', 'a sold truck cannot be edited');
select throws_ok($$ insert into public.odometer_readings (organization_id, asset_type, truck_id, reading, reading_type)
                    values ('a0000000-0000-4000-8000-000000000001', 'truck', (select a_truck from ids), 400000, 'odometer') $$,
  'P0001', 'A sold asset is read-only', 'a sold truck gets no new readings');
select lives_ok($$ update public.trucks set archived_at = now() where id = (select a_truck from ids) $$,
  'a sold truck can be archived');
select lives_ok($$ update public.trucks set status = 'active', archived_at = null where id = (select a_truck from ids) $$,
  'owner can un-sell and restore');
select pg_temp.logout();

select * from finish();
rollback;
