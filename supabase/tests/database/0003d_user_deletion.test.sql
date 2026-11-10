-- Tests for migration 0003d: users who have acted can be deleted; history survives.
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

-- Lakeside admin (1000..02) acts: edits the org, adds a pay rule in effect, adds and sells a truck.
select pg_temp.login('10000000-0000-4000-8000-000000000002');
update public.organizations set city = 'Joliet' where id = 'a0000000-0000-4000-8000-000000000001';
insert into public.driver_pay_rules (organization_id, driver_id, effective_from, pay_type, flat_cents)
select organization_id, id, current_date, 'flat', 40000 from public.drivers where last_name = 'Bishop';
insert into public.trucks (organization_id, unit_number, vin, status)
values ('a0000000-0000-4000-8000-000000000001', 'DEL1', '1FUJHHDR8JP000009', 'active');
update public.trucks set status = 'sold' where unit_number = 'DEL1';
select pg_temp.logout();

select ok((select count(*) > 0 from public.audit_logs where actor_id = '10000000-0000-4000-8000-000000000002'),
  'the admin has audit history');

select lives_ok($$ delete from auth.users where id = '10000000-0000-4000-8000-000000000002' $$,
  'a user with audit history, pay rules in effect and a sold truck can be deleted');
select ok((select count(*) > 0 from public.audit_logs where actor_id = '10000000-0000-4000-8000-000000000002'),
  'audit history keeps the deleted user''s id');
select is((select created_by from public.trucks where unit_number = 'DEL1'), null, 'created_by is cleared on the sold truck');
select is((select status::text from public.trucks where unit_number = 'DEL1'), 'sold', 'the sold truck is otherwise unchanged');
select is((select count(*)::int from public.organization_members where user_id = '10000000-0000-4000-8000-000000000002'), 0,
  'the membership is gone');

-- Guards still hold for real edits.
select throws_ok($$ update public.trucks set plate = 'X1' where unit_number = 'DEL1' $$,
  'P0001', 'A sold asset is read-only', 'sold truck is still read-only');
select throws_ok($$ update public.driver_pay_rules set flat_cents = 1
                    where driver_id = (select id from public.drivers where last_name = 'Bishop') and effective_from = current_date $$,
  'P0001', null, 'a pay rule in effect still cannot be changed');

-- The last owner of an organization still cannot be deleted.
select throws_ok($$ delete from auth.users where id = '20000000-0000-4000-8000-000000000001' $$,
  'P0001', 'An organization must have at least one owner', 'the sole owner of an organization cannot be deleted');

select * from finish();
rollback;
