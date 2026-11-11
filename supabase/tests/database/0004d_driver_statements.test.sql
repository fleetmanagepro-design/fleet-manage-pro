-- Tests for migration 0004d (weekly driver statements). Run: npm run test:db
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
  (select id from public.drivers where last_name = 'Long') as long,
  (select id from public.drivers where organization_id = 'b0000000-0000-4000-8000-000000000001' limit 1) as b_driver,
  (select l.id from public.loads l join public.load_drivers ld on ld.load_id = l.id join public.drivers d on d.id = ld.driver_id
     where d.last_name = 'Long' and l.status = 'delivered' order by l.load_number limit 1) as long_load,
  (select l.id from public.loads l join public.load_drivers ld on ld.load_id = l.id join public.drivers d on d.id = ld.driver_id
     where d.last_name = 'Carter' and l.status = 'delivered' order by l.load_number limit 1) as other_load,
  (select id from public.drivers where last_name = 'Carter') as carter,
  (select id from public.loads where load_number = '1061') as carter_in_transit,
  (select id from public.driver_deductions where name = 'Trailer rent') as trailer_rent,
  date_trunc('week', current_date)::date - 70 as w1;
grant select on ids to authenticated;

create function pg_temp.hdr(loads int, gross bigint, fee bigint, extras bigint, ded bigint, carried bigint, net bigint) returns jsonb
language sql as $$
  select jsonb_build_object('load_count', loads, 'gross_cents', gross, 'company_fee_cents', fee, 'extras_cents', extras,
    'deductions_cents', ded, 'carried_in_cents', carried, 'net_cents', net);
$$;
create function pg_temp.load_line(load uuid, amount bigint) returns jsonb language sql as $$
  select jsonb_build_object('line_type', 'load', 'load_id', load, 'description', 'Load', 'value_cents', 100000, 'fee_cents', 12000, 'amount_cents', amount);
$$;
create function pg_temp.rent_line() returns jsonb language sql as $$
  select jsonb_build_object('line_type', 'deduction', 'deduction_id', (select trailer_rent from ids), 'description', 'Trailer rent', 'amount_cents', -25000);
$$;
create function pg_temp.carry_line(amount bigint) returns jsonb language sql as $$
  select jsonb_build_object('line_type', 'carryover', 'description', 'Balance from previous statement', 'amount_cents', amount);
$$;
create function pg_temp.fin(week date, header jsonb, lines jsonb, driver uuid default null) returns uuid language sql as $$
  select public.finalize_driver_statement((select org from ids), coalesce(driver, (select long from ids)), week, header, lines);
$$;

-- =============================================================================
-- Access
-- =============================================================================
select set_config('role', 'anon', true);
select throws_ok($$ select * from public.driver_statements $$, '42501', null, 'anon cannot read statements');
select pg_temp.logout();

select pg_temp.login('10000000-0000-4000-8000-000000000003'); -- dispatcher
select throws_ok($$ select pg_temp.fin((select w1 from ids), pg_temp.hdr(0,0,0,0,25000,0,-25000), jsonb_build_array(pg_temp.rent_line())) $$,
  '42501', null, 'dispatcher cannot finalize a statement');
select pg_temp.logout();

-- =============================================================================
-- Finalizing
-- =============================================================================
select pg_temp.login('10000000-0000-4000-8000-000000000005'); -- accounting
create temp table st (name text, id uuid);
grant all on st to authenticated;

insert into st select 'w1', pg_temp.fin((select w1 from ids), pg_temp.hdr(1, 100000, 12000, 0, 25000, 0, 63000),
  jsonb_build_array(pg_temp.load_line((select long_load from ids), 88000), pg_temp.rent_line()));
select isnt((select id from st where name = 'w1'), null, 'accounting finalizes a statement');
select is((select count(*)::int from public.driver_statement_lines where statement_id = (select id from st where name = 'w1')), 2, 'lines are stored');
select is((select net_cents from public.driver_statements where id = (select id from st where name = 'w1')), 63000::bigint, 'net is stored');

select throws_ok($$ insert into public.driver_statements (organization_id, driver_id, week_start, load_count, gross_cents, company_fee_cents,
                      extras_cents, deductions_cents, carried_in_cents, net_cents)
                    values ((select org from ids), (select long from ids), (select w1 from ids) + 28, 0, 0, 0, 0, 0, 0, 0) $$,
  '42501', null, 'statements cannot be inserted directly');
select throws_ok($$ update public.driver_statements set net_cents = 1 $$, '42501', null, 'statements cannot be edited');
select throws_ok($$ delete from public.driver_statement_lines $$, '42501', null, 'statement lines cannot be deleted');

select throws_ok($$ select pg_temp.fin((select w1 from ids), pg_temp.hdr(0,0,0,0,25000,0,-25000), jsonb_build_array(pg_temp.rent_line())) $$,
  'P0001', 'A statement for this week or a later week is already finalized', 'one live statement per week');
select throws_ok($$ select pg_temp.fin((select w1 from ids) - 7, pg_temp.hdr(0,0,0,0,25000,0,-25000), jsonb_build_array(pg_temp.rent_line())) $$,
  'P0001', 'A statement for this week or a later week is already finalized', 'weeks are finalized in order');
select throws_ok($$ select pg_temp.fin((select w1 from ids) + 1, pg_temp.hdr(0,0,0,0,0,0,0), '[]') $$,
  '22023', 'A pay week starts on a Monday', 'a week starts on Monday');
select throws_ok($$ select pg_temp.fin(date_trunc('week', current_date)::date, pg_temp.hdr(0,0,0,0,0,0,0), '[]') $$,
  'P0001', 'This week isn''t over yet', 'the current week cannot be finalized');
select throws_ok($$ select pg_temp.fin((select w1 from ids) + 7, pg_temp.hdr(0,0,0,0,25000,0,-1), jsonb_build_array(pg_temp.rent_line())) $$,
  '23514', null, 'totals must add up');
select throws_ok($$ select pg_temp.fin((select w1 from ids) + 7, pg_temp.hdr(0,0,0,0,0,0,0), jsonb_build_array(pg_temp.rent_line())) $$,
  '22023', 'Statement lines do not add up', 'lines must add up to the net');
select throws_ok($$ select pg_temp.fin((select w1 from ids) + 7, pg_temp.hdr(1, 100000, 12000, 0, 0, 0, 88000),
                      jsonb_build_array(pg_temp.load_line((select other_load from ids), 88000))) $$,
  'P0001', 'A load on the statement is not this driver''s', 'only the driver''s own loads');
select throws_ok($$ select pg_temp.fin((select w1 from ids), pg_temp.hdr(1, 100000, 12000, 0, 0, 0, 88000),
                      jsonb_build_array(pg_temp.load_line((select carter_in_transit from ids), 88000)), (select carter from ids)) $$,
  'P0001', 'Load 1061 is not delivered yet', 'only delivered loads');

-- Week 2: no loads, trailer rent → −$250, carried into week 3 (decision 2a)
insert into st select 'w2', pg_temp.fin((select w1 from ids) + 7, pg_temp.hdr(0,0,0,0,25000,0,-25000), jsonb_build_array(pg_temp.rent_line()));
select is((select net_cents from public.driver_statements where id = (select id from st where name = 'w2')), -25000::bigint, 'a negative net is allowed');
select throws_ok($$ select pg_temp.fin((select w1 from ids) + 14, pg_temp.hdr(0,0,0,0,0,0,0), '[]') $$,
  'P0001', 'The balance carried in has changed — reload the statement', 'the debt must be carried into the next week');
select throws_ok($$ select pg_temp.fin((select w1 from ids) + 14, pg_temp.hdr(1, 100000, 12000, 0, 0, -25000, 63000),
                      jsonb_build_array(pg_temp.load_line((select long_load from ids), 88000), pg_temp.carry_line(-25000))) $$,
  'P0001', format('Load %s is already on another statement', (select load_number from public.loads where id = (select long_load from ids))),
  'a load is paid on one statement only');
select throws_ok($$ select pg_temp.fin((select w1 from ids) + 14, pg_temp.hdr(0,0,0,0,0,-25000,-25000), '[]') $$,
  '22023', 'Statement lines do not add up', 'the carried balance needs its line');
insert into st select 'w3', pg_temp.fin((select w1 from ids) + 14, pg_temp.hdr(0,0,0,0,0,-25000,-25000), jsonb_build_array(pg_temp.carry_line(-25000)));
select is((select carried_in_cents from public.driver_statements where id = (select id from st where name = 'w3')), -25000::bigint,
  'week 3 carries the week 2 debt');

-- =============================================================================
-- Voiding
-- =============================================================================
select throws_ok($$ select public.void_driver_statement((select id from st where name = 'w2'), 'Wrong rent') $$,
  'P0001', 'Void the later statements first — they carry this balance', 'void in reverse week order');
select throws_ok($$ select public.void_driver_statement((select id from st where name = 'w3'), '  ') $$,
  'P0001', 'A reason is required', 'voiding needs a reason');
select lives_ok($$ select public.void_driver_statement((select id from st where name = 'w3'), 'Recalculate') $$, 'void the latest statement');
select is((select void_reason from public.driver_statements where id = (select id from st where name = 'w3')), 'Recalculate', 'void reason kept');
select throws_ok($$ select public.void_driver_statement((select id from st where name = 'w3'), 'Again') $$,
  'P0001', 'This statement is already void', 'a void statement stays void');
select lives_ok($$ select pg_temp.fin((select w1 from ids) + 14, pg_temp.hdr(0,0,0,0,0,-25000,-25000), jsonb_build_array(pg_temp.carry_line(-25000))) $$,
  'a voided week can be finalized again');
select is((select count(*)::int from public.driver_statements where week_start = (select w1 from ids) + 14), 2, 'the voided statement is kept');
select pg_temp.logout();

select ok((select count(*) from public.audit_logs where table_name = 'driver_statements') >= 4, 'statement changes are audited');

-- =============================================================================
-- Isolation
-- =============================================================================
select pg_temp.login('10000000-0000-4000-8000-000000000003'); -- dispatcher
select is((select count(*)::int from public.driver_statements), 0, 'dispatcher cannot see statements');
select is((select count(*)::int from public.driver_statement_lines), 0, 'dispatcher cannot see statement lines');
select pg_temp.logout();

select pg_temp.login('20000000-0000-4000-8000-000000000001'); -- Org B owner
select is((select count(*)::int from public.driver_statements where organization_id = (select org from ids)), 0, 'Org B cannot read Org A statements');
select is((select count(*)::int from public.driver_statement_lines where organization_id = (select org from ids)), 0, 'Org B cannot read Org A lines');
select throws_ok($$ select pg_temp.fin((select w1 from ids) + 21, pg_temp.hdr(0,0,0,0,0,0,0), '[]') $$,
  '42501', null, 'Org B cannot finalize an Org A statement');
select throws_ok($$ select public.void_driver_statement((select id from st where name = 'w1'), 'x') $$,
  '42501', 'Statement not found', 'Org B cannot void an Org A statement');
select throws_ok($$ select public.finalize_driver_statement('b0000000-0000-4000-8000-000000000001', (select long from ids), (select w1 from ids),
                      pg_temp.hdr(0,0,0,0,0,0,0), '[]') $$,
  '42501', 'Driver not found', 'Org B cannot finalize for an Org A driver');
select throws_ok($$ select public.finalize_driver_statement('b0000000-0000-4000-8000-000000000001', (select b_driver from ids), (select w1 from ids),
                      pg_temp.hdr(1, 100000, 12000, 0, 0, 0, 88000), jsonb_build_array(pg_temp.load_line((select long_load from ids), 88000))) $$,
  null, null, 'Org B cannot put an Org A load on its statement');
select pg_temp.logout();
select is((select count(*)::int from public.driver_statements where organization_id = 'b0000000-0000-4000-8000-000000000001'), 0,
  'nothing was written for Org B');

select * from finish();
rollback;
