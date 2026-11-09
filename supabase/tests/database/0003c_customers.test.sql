-- Tests for migration 0003c (customers, contacts). Run: npm run test:db
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
  (select id from public.customers where name = 'Sandhills Freight Brokers') as b_customer,
  (select id from public.customer_contacts where name = 'Jo Anders') as b_contact;
grant select on ids to authenticated;

-- Users: A owner 1000..01, dispatcher ..03, maintenance ..04, accounting ..05, viewer ..06; B owner 2000..01

-- Isolation -------------------------------------------------------------------
select set_config('role', 'anon', true);
select throws_ok($$ select * from public.customers $$, '42501', null, 'anon cannot read customers');
select pg_temp.logout();

select pg_temp.login('10000000-0000-4000-8000-000000000006'); -- A viewer
select is((select count(*)::int from public.customers), 10, 'Org A member sees only Org A customers');
select is((select count(*)::int from public.customer_contacts where organization_id = 'b0000000-0000-4000-8000-000000000001'), 0,
  'Org A cannot read Org B contacts');
select pg_temp.logout();

select pg_temp.login('10000000-0000-4000-8000-000000000003'); -- A dispatcher
update public.customers set notes = 'hacked' where id = (select b_customer from ids);
delete from public.customer_contacts where id = (select b_contact from ids);
select throws_ok($$ insert into public.customers (organization_id, name) values ('b0000000-0000-4000-8000-000000000001', 'X') $$,
  '42501', null, 'Org A cannot add a customer to Org B');
select throws_ok($$ insert into public.customer_contacts (organization_id, customer_id, name)
                    values ('a0000000-0000-4000-8000-000000000001', (select b_customer from ids), 'Sneaky') $$,
  '23503', null, 'a contact cannot point at another organization''s customer');
select pg_temp.logout();
select is((select notes from public.customers where id = (select b_customer from ids)), null, 'Org B customer unchanged');
select is((select count(*)::int from public.customer_contacts where id = (select b_contact from ids)), 1, 'Org B contact not deleted');

select pg_temp.login('20000000-0000-4000-8000-000000000001'); -- B owner
select is((select count(*)::int from public.customers), 3, 'Org B sees its 3 customers');
update public.customers set notes = 'hacked' where id = (select a_customer from ids);
select pg_temp.logout();
select is((select notes from public.customers where id = (select a_customer from ids)), null, 'Org A customer unchanged by Org B');

-- Roles -----------------------------------------------------------------------
select pg_temp.login('10000000-0000-4000-8000-000000000004'); -- maintenance
select throws_ok($$ insert into public.customers (organization_id, name) values ('a0000000-0000-4000-8000-000000000001', 'M') $$,
  '42501', null, 'maintenance cannot add customers');
update public.customers set payment_terms_days = 99 where id = (select a_customer from ids);
select pg_temp.logout();
select is((select payment_terms_days from public.customers where id = (select a_customer from ids)), 30, 'maintenance cannot edit customers');

select pg_temp.login('10000000-0000-4000-8000-000000000006'); -- viewer
select throws_ok($$ insert into public.customer_contacts (organization_id, customer_id, name)
                    values ('a0000000-0000-4000-8000-000000000001', (select a_customer from ids), 'V') $$,
  '42501', null, 'viewer cannot add contacts');
select pg_temp.logout();

select pg_temp.login('10000000-0000-4000-8000-000000000003'); -- dispatcher
select lives_ok($$ insert into public.customers (organization_id, name, mc_number)
                   values ('a0000000-0000-4000-8000-000000000001', 'Northline Freight Brokerage', '123456') $$,
  'dispatcher can add a customer; names may repeat');
select throws_ok($$ insert into public.customers (organization_id, name, mc_number)
                    values ('a0000000-0000-4000-8000-000000000001', 'Another', '610233') $$,
  '23505', null, 'MC number is unique within the organization');
select throws_ok($$ update public.customers set status = 'do_not_use' where id = (select a_customer from ids) $$,
  '23514', null, 'do not use requires a reason');
select lives_ok($$ update public.customers set status = 'do_not_use', do_not_use_reason = 'Late payer' where id = (select a_customer from ids) $$,
  'do not use with a reason');
select throws_ok($$ delete from public.customers where id = (select a_customer from ids) $$, '42501', null, 'customers cannot be deleted');
update public.customers set archived_at = now() where mc_number = '123456';
select lives_ok($$ insert into public.customer_contacts (organization_id, customer_id, name, email)
                   values ('a0000000-0000-4000-8000-000000000001', (select a_customer from ids), 'New Contact', 'new@example.test') $$,
  'dispatcher can add a contact');
select lives_ok($$ delete from public.customer_contacts where name = 'New Contact' $$, 'dispatcher can remove a contact');
select pg_temp.logout();

select is((select archived_by from public.customers where mc_number = '123456'), '10000000-0000-4000-8000-000000000003'::uuid,
  'archived_by records who archived');
select ok((select count(*) > 0 from public.audit_logs where table_name = 'customer_contacts' and action = 'delete'), 'contact removal is audited');
select ok((select count(*) > 0 from public.audit_logs where table_name = 'customers' and new_data ->> 'status' = 'do_not_use'),
  'status change is audited');

select * from finish();
rollback;
