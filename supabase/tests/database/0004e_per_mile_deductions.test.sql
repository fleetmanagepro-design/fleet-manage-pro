-- Tests for migration 0004e (weekly + per-mile deductions). Run: npm run test:db
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
  'a0000000-0000-4000-8000-000000000001'::uuid as org,
  (select id from public.drivers where last_name = 'Long') as long;
grant select on ids to authenticated;

select pg_temp.login('10000000-0000-4000-8000-000000000005'); -- accounting
select lives_ok($$ insert into public.driver_deductions (organization_id, driver_id, name, kind, amount_cents, rate_cents_per_mile, free_miles, starts_on)
                   values ((select org from ids), (select long from ids), 'Truck rent', 'per_mile', 30000, 10, 2000, current_date) $$,
  'weekly amount + rate per mile over free miles');
select lives_ok($$ insert into public.driver_deductions (organization_id, driver_id, name, kind, rate_cents_per_mile, free_miles, starts_on)
                   values ((select org from ids), (select long from ids), 'Trailer rent', 'per_mile', 5, 0, current_date) $$,
  'per mile only, every mile');
select throws_ok($$ insert into public.driver_deductions (organization_id, driver_id, name, kind, amount_cents, free_miles, starts_on)
                    values ((select org from ids), (select long from ids), 'X', 'per_mile', 30000, 0, current_date) $$,
  '23514', null, 'a per-mile deduction needs a rate');
select throws_ok($$ insert into public.driver_deductions (organization_id, driver_id, name, kind, rate_cents_per_mile, starts_on)
                    values ((select org from ids), (select long from ids), 'X', 'per_mile', 10, current_date) $$,
  '23514', null, 'a per-mile deduction needs its free miles (0 for none)');
select throws_ok($$ insert into public.driver_deductions (organization_id, driver_id, name, kind, rate_cents_per_mile, free_miles, starts_on)
                    values ((select org from ids), (select long from ids), 'X', 'per_mile', 10, -1, current_date) $$,
  '23514', null, 'free miles cannot be negative');
select throws_ok($$ insert into public.driver_deductions (organization_id, driver_id, name, kind, percent, rate_cents_per_mile, starts_on)
                    values ((select org from ids), (select long from ids), 'X', 'percent_of_gross', 10, 10, current_date) $$,
  '23514', null, 'a percent deduction has no rate per mile');
select throws_ok($$ update public.driver_deductions set rate_cents_per_mile = 1 $$, '42501', null, 'the rate cannot be changed afterwards');
select pg_temp.logout();

select pg_temp.login('20000000-0000-4000-8000-000000000001'); -- Org B owner
select throws_ok($$ insert into public.driver_deductions (organization_id, driver_id, name, kind, rate_cents_per_mile, free_miles, starts_on)
                    values ((select org from ids), (select long from ids), 'X', 'per_mile', 10, 0, current_date) $$,
  '42501', null, 'Org B cannot add a deduction for an Org A driver');
select pg_temp.logout();

select * from finish();
rollback;
