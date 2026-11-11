-- Tests for migrations 0004f (US ZIP codes) and 0004g (remembered facilities). Run: npm run test:db
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
  'a0000000-0000-4000-8000-000000000001'::uuid as a_org,
  'b0000000-0000-4000-8000-000000000001'::uuid as b_org,
  (select id from public.customers where name = 'Northline Freight Brokerage') as a_customer,
  (select id from public.customers where name = 'Platte River Grain') as b_customer,
  (select id from public.facilities where organization_id = 'a0000000-0000-4000-8000-000000000001' order by name limit 1) as a_facility;
grant select on ids to authenticated;

create function pg_temp.stops(facility text) returns jsonb language sql as $$
  select jsonb_build_array(
    jsonb_build_object('stop_type', 'pickup', 'facility_name', facility, 'address_line1', '2101 Stafford Rd',
      'city', 'Plainfield', 'state', 'IN', 'zip', '46168', 'timezone', 'America/Indiana/Indianapolis'),
    jsonb_build_object('stop_type', 'delivery', 'facility_name', '  ', 'city', 'Paducah', 'state', 'KY', 'zip', '42001',
      'timezone', 'America/Chicago'));
$$;

-- =============================================================================
-- ZIP codes: shared, read-only reference data
-- =============================================================================
select set_config('role', 'anon', true);
select throws_ok($$ select * from public.us_zip_codes $$, '42501', null, 'anon cannot read ZIP codes');
select pg_temp.logout();

select pg_temp.login('20000000-0000-4000-8000-000000000001'); -- Org B owner
select is((select city || ', ' || state || ' · ' || timezone from public.us_zip_codes where zip = '60439'),
  'Lemont, IL · America/Chicago', 'any signed-in user looks up a ZIP');
select is((select timezone from public.us_zip_codes where zip = '42001'), 'America/Chicago', 'western Kentucky is Central');
select is((select timezone from public.us_zip_codes where zip = '46320'), 'America/Chicago', 'Hammond, IN is Central');
select is((select timezone from public.us_zip_codes where zip = '46204'), 'America/Indiana/Indianapolis', 'Indianapolis is Eastern');
select is((select timezone from public.us_zip_codes where zip = '79901'), 'America/Denver', 'El Paso is Mountain');
select throws_ok($$ insert into public.us_zip_codes values ('00000', 'X', 'IL', 'America/Chicago') $$, '42501', null, 'users cannot add ZIP codes');
select throws_ok($$ update public.us_zip_codes set city = 'X' where zip = '60439' $$, '42501', null, 'users cannot change ZIP codes');
select throws_ok($$ delete from public.us_zip_codes where zip = '60439' $$, '42501', null, 'users cannot delete ZIP codes');
select pg_temp.logout();

-- =============================================================================
-- Facilities: remembered from saved stops, per organization
-- =============================================================================
select pg_temp.login('10000000-0000-4000-8000-000000000003'); -- A dispatcher
select ok((select count(*) from public.facilities) > 0, 'seed loads remembered their facilities');
select lives_ok($$ select public.save_load(jsonb_build_object('organization_id', (select a_org from ids), 'customer_id', (select a_customer from ids)),
                   pg_temp.stops('Walmart DC 6092'), '{}') $$, 'save a load with a new facility');
select is((select city || ', ' || state || ' ' || zip || ' · ' || use_count from public.facilities where name = 'Walmart DC 6092'),
  'Plainfield, IN 46168 · 1', 'the new facility is remembered with its address');
select is((select count(*)::int from public.facilities where city = 'Paducah'), 0, 'a stop without a facility name is not remembered');
select lives_ok($$ select public.save_load(jsonb_build_object('organization_id', (select a_org from ids), 'customer_id', (select a_customer from ids)),
                   pg_temp.stops('WALMART DC 6092 '), '{}') $$, 'save another load to the same facility');
select is((select use_count from public.facilities where lower(name) = 'walmart dc 6092'), 2, 'same name + street + ZIP is one facility');
select throws_ok($$ insert into public.facilities (organization_id, name, city, state, timezone)
                    values ((select a_org from ids), 'X', 'Y', 'IL', 'America/Chicago') $$, '42501', null, 'facilities are added only by saving loads');
select lives_ok($$ update public.facilities set notes = 'Dock 4, call ahead', archived_at = now() where name = 'Walmart DC 6092' $$,
  'dispatch can correct or archive a facility');
select throws_ok($$ delete from public.facilities $$, '42501', null, 'facilities are never deleted');
select throws_ok($$ update public.facilities set use_count = 99 $$, '42501', null, 'the use count is kept by the database');
select pg_temp.logout();

select pg_temp.login('10000000-0000-4000-8000-000000000006'); -- A viewer
select ok((select count(*) from public.facilities) > 0, 'every member reads facilities');
update public.facilities set notes = 'viewer' where id = (select a_facility from ids);
select pg_temp.logout();
select isnt((select notes from public.facilities where id = (select a_facility from ids)), 'viewer', 'a viewer cannot change facilities');

-- Isolation ---------------------------------------------------------------------
select pg_temp.login('20000000-0000-4000-8000-000000000001'); -- Org B owner
select is((select count(*)::int from public.facilities where organization_id = (select a_org from ids)), 0, 'Org B cannot read Org A facilities');
update public.facilities set notes = 'hacked' where id = (select a_facility from ids);
select lives_ok($$ select public.save_load(jsonb_build_object('organization_id', (select b_org from ids), 'customer_id', (select b_customer from ids)),
                   pg_temp.stops('Walmart DC 6092'), '{}') $$, 'Org B saves a load to a facility with the same name');
select is((select count(*)::int from public.facilities where name = 'Walmart DC 6092'), 1, 'Org B sees only its own copy');
select pg_temp.logout();
select isnt((select notes from public.facilities where id = (select a_facility from ids)), 'hacked', 'Org B cannot change Org A facilities');
select is((select use_count from public.facilities where organization_id = (select a_org from ids) and lower(name) = 'walmart dc 6092'), 2,
  'Org B''s load did not touch Org A''s facility');

select * from finish();
rollback;
