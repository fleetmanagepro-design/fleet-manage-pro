-- Tests for migration 0004i (driver's default trailer). Run: npm run test:db
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
  (select id from public.drivers where last_name = 'Carter') as carter,
  (select id from public.trailers where organization_id = 'a0000000-0000-4000-8000-000000000001' and unit_number = '5310') as a_trailer,
  (select id from public.trailers where organization_id = 'b0000000-0000-4000-8000-000000000001' limit 1) as b_trailer;
grant select on ids to authenticated;

select is((select tr.unit_number from public.drivers d join public.trailers tr on tr.id = d.default_trailer_id where d.id = (select carter from ids)),
  '5301', 'seed: Carter pulls trailer 5301');

select pg_temp.login('10000000-0000-4000-8000-000000000005'); -- accounting
select lives_ok($$ update public.drivers set default_trailer_id = (select a_trailer from ids) where id = (select carter from ids) $$,
  'a driver editor sets the default trailer');
select throws_ok($$ update public.drivers set default_trailer_id = (select b_trailer from ids) where id = (select carter from ids) $$,
  '23503', null, 'another organization''s trailer is refused');
select pg_temp.logout();
select is((select default_trailer_id from public.drivers where id = (select carter from ids)), (select a_trailer from ids), 'default trailer saved');

select pg_temp.login('10000000-0000-4000-8000-000000000003'); -- dispatcher
update public.drivers set default_trailer_id = null where id = (select carter from ids);
select pg_temp.logout();
select isnt((select default_trailer_id from public.drivers where id = (select carter from ids)), null, 'a dispatcher cannot change it');

select pg_temp.login('20000000-0000-4000-8000-000000000001'); -- Org B owner
update public.drivers set default_trailer_id = null where id = (select carter from ids);
select pg_temp.logout();
select isnt((select default_trailer_id from public.drivers where id = (select carter from ids)), null, 'Org B cannot change an Org A driver');

select * from finish();
rollback;
