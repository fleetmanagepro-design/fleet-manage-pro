-- Demo data: 40 trucks, 40 trailers, 40 drivers (each tied to a truck and trailer, with a pay rule) and 40 brokers.
-- Run once in the Supabase SQL Editor of the project (it runs as the database owner).
--
-- Which company: if the database has exactly one organization, it is used. Otherwise put the company's
-- exact name in v_org_name below.
-- Safe to run twice: records that already exist (same unit #, VIN, CDL # or MC #) are skipped.
-- Everything it adds is marked so it can be found again: trucks 201–240, trailers 6001–6040,
-- drivers with CDL numbers starting "DEMO", brokers with MC numbers 900001–900040.

create or replace function pg_temp.vin_with_check(base text) returns text language plpgsql as $$
declare
  map constant text := 'A1B2C3D4E5F6G7H8J1K2L3M4N5P7R9S2T3U4V5W6X7Y8Z9';
  weights constant int[] := array[8,7,6,5,4,3,2,10,0,9,8,7,6,5,4,3,2];
  total int := 0; ch text; val int; i int; r int;
begin
  for i in 1..17 loop
    ch := substr(base, i, 1);
    val := case when ch ~ '[0-9]' then ch::int else substr(map, strpos(map, ch) + 1, 1)::int end;
    total := total + val * weights[i];
  end loop;
  r := total % 11;
  return overlay(base placing (case when r = 10 then 'X' else r::text end) from 9 for 1);
end $$;

do $$
declare
  v_org_name text := null;  -- e.g. 'My Trucking LLC' when there is more than one company
  v_org uuid;
  v_count int;
  firsts constant text[] := array['James','Maria','Robert','Linda','Michael','Patricia','David','Jennifer','William','Elizabeth',
    'Richard','Susan','Joseph','Jessica','Thomas','Sarah','Charles','Karen','Daniel','Nancy',
    'Matthew','Lisa','Anthony','Betty','Mark','Sandra','Donald','Ashley','Steven','Kimberly',
    'Paul','Emily','Andrew','Donna','Joshua','Michelle','Kenneth','Carol','Kevin','Amanda'];
  lasts constant text[] := array['Anderson','Baker','Campbell','Davis','Evans','Fisher','Garcia','Harris','Irwin','Jackson',
    'King','Lewis','Martin','Nelson','Owens','Parker','Quinn','Roberts','Scott','Turner',
    'Underwood','Vasquez','Walker','Young','Zimmerman','Adams','Bennett','Collins','Dixon','Ellis',
    'Ford','Graham','Hughes','Ingram','Jenkins','Knight','Lawson','Mitchell','Norris','Ortiz'];
  states constant text[] := array['IL','IN','OH','WI','IA','MO','MI','KY','TN','TX'];
  cities constant text[] := array['Chicago','Indianapolis','Columbus','Milwaukee','Des Moines','St. Louis','Detroit','Louisville','Nashville','Dallas'];
  broker_a constant text[] := array['Apex','Blue Ridge','Cardinal','Delta','Eagle','Frontier','Granite','Horizon','Iron Gate','Jetstream'];
  broker_b constant text[] := array['Freight','Logistics','Transport','Cargo'];
begin
  if v_org_name is null then
    select count(*) into v_count from public.organizations;
    if v_count <> 1 then
      raise exception 'There are % companies. Put the company name in v_org_name at the top of the script: %',
        v_count, (select string_agg(name, ', ') from public.organizations);
    end if;
    select id into v_org from public.organizations;
  else
    select id into v_org from public.organizations where name = v_org_name;
    if v_org is null then
      raise exception 'No company named "%". Companies: %', v_org_name, (select string_agg(name, ', ') from public.organizations);
    end if;
  end if;

  -- Trucks 201–240
  insert into public.trucks
    (organization_id, unit_number, vin, year, make, model, plate, plate_state, ownership,
     purchase_date, purchase_price_cents, status, registration_expires_on, annual_inspection_on,
     annual_inspection_valid_months, insurance_expires_on)
  select v_org, (200 + n)::text,
    pg_temp.vin_with_check((array['1FUJHHDR','1XKYD49X','1XPBD49X','4V4NC9EH','3AKJHHDR'])[1 + n % 5] || '0' ||
                           (array['J','K','L','M','N','P'])[1 + n % 6] || 'D' || lpad((610000 + n * 173)::text, 6, '0')),
    2016 + n % 9,
    (array['Freightliner','Kenworth','Peterbilt','Volvo','International'])[1 + n % 5],
    (array['Cascadia','T680','579','VNL 760','LT625'])[1 + n % 5],
    'DT' || lpad((4100 + n)::text, 5, '0'), states[1 + n % 10],
    (array['owned','financed','leased']::public.ownership_type[])[1 + n % 3],
    current_date - (300 + n * 20), (9500000 + n * 110000)::bigint,
    case when n % 13 = 0 then 'in_shop' else 'active' end::public.asset_status,
    current_date + 30 + n * 8, current_date - (n * 7), 12, current_date + 60 + n * 6
  from generate_series(1, 40) n
  on conflict do nothing;

  -- Trailers 6001–6040
  insert into public.trailers
    (organization_id, unit_number, vin, year, make, trailer_type, length_ft, plate, plate_state, ownership,
     purchase_date, purchase_price_cents, status, registration_expires_on, annual_inspection_on)
  select v_org, (6000 + n)::text,
    pg_temp.vin_with_check((array['1UYVS253','1JJV532D','1GRAA062'])[1 + n % 3] || '0' ||
                           (array['J','K','L','M','N','P'])[1 + n % 6] || 'D' || lpad((720000 + n * 91)::text, 6, '0')),
    2013 + n % 11,
    (array['Utility','Wabash','Great Dane'])[1 + n % 3],
    case when n <= 26 then 'dry_van' when n <= 36 then 'reefer' else 'flatbed' end::public.trailer_type,
    case when n % 7 = 0 then 48 else 53 end,
    'DR' || lpad((5100 + n)::text, 5, '0'), states[1 + n % 10],
    (array['owned','leased']::public.ownership_type[])[1 + n % 2],
    current_date - (250 + n * 15), (3100000 + n * 60000)::bigint,
    'active', current_date + 40 + n * 7, current_date - (n * 6)
  from generate_series(1, 40) n
  on conflict do nothing;

  -- Drivers: 30 company drivers, 10 owner-operators; driver n runs truck 200+n with trailer 6000+n
  insert into public.drivers
    (organization_id, first_name, last_name, phone, email, driver_type, hire_date, status,
     cdl_number, cdl_state, cdl_class, cdl_expires_on, medical_card_expires_on,
     default_truck_id, default_trailer_id, emergency_contact_name, emergency_contact_phone)
  select v_org, firsts[n], lasts[n],
    '(555) 300-' || lpad(n::text, 4, '0'),
    lower(firsts[n]) || '.' || lower(lasts[n]) || '@demo-drivers.test',
    case when n > 30 then 'owner_operator' else 'company' end::public.driver_type,
    current_date - (120 + n * 25), 'active',
    'DEMO' || lpad((70000 + n)::text, 8, '0'), states[1 + n % 10], 'A',
    current_date + 200 + n * 15, current_date + 100 + n * 9,
    (select id from public.trucks where organization_id = v_org and unit_number = (200 + n)::text),
    (select id from public.trailers where organization_id = v_org and unit_number = (6000 + n)::text),
    'Emergency contact ' || n, '(555) 301-' || lpad(n::text, 4, '0')
  from generate_series(1, 40) n
  on conflict do nothing;

  -- Pay rules for the demo drivers that don't have one: company $0.58/mi loaded, owner-operators keep 88%
  insert into public.driver_pay_rules (organization_id, driver_id, effective_from, pay_type, rate_cents_per_mile, miles_basis)
  select d.organization_id, d.id, d.hire_date, 'per_mile', 58, 'loaded'
  from public.drivers d
  where d.organization_id = v_org and d.cdl_number like 'DEMO%' and d.driver_type = 'company'
    and not exists (select 1 from public.driver_pay_rules r where r.driver_id = d.id);

  insert into public.driver_pay_rules (organization_id, driver_id, effective_from, pay_type, percent, percent_basis)
  select d.organization_id, d.id, d.hire_date, 'percent', 88.00, 'total'
  from public.drivers d
  where d.organization_id = v_org and d.cdl_number like 'DEMO%' and d.driver_type = 'owner_operator'
    and not exists (select 1 from public.driver_pay_rules r where r.driver_id = d.id);

  -- Brokers, MC 900001–900040
  insert into public.customers
    (organization_id, name, customer_type, mc_number, billing_email, phone, city, state, payment_terms_days, status)
  select v_org,
    broker_a[1 + (n - 1) % 10] || ' ' || broker_b[1 + (n - 1) / 10] || ' Brokerage',
    'broker', (900000 + n)::text,
    'ap' || n || '@demo-broker.test', '(555) 400-' || lpad(n::text, 4, '0'),
    cities[1 + n % 10], states[1 + n % 10],
    (array[15, 30, 30, 45])[1 + n % 4], 'active'
  from generate_series(1, 40) n
  on conflict do nothing;

  raise notice 'Demo data added to company %: trucks %, trailers %, drivers %, brokers %',
    (select name from public.organizations where id = v_org),
    (select count(*) from public.trucks where organization_id = v_org and unit_number ~ '^2[0-4][0-9]$'),
    (select count(*) from public.trailers where organization_id = v_org and unit_number ~ '^60[0-4][0-9]$'),
    (select count(*) from public.drivers where organization_id = v_org and cdl_number like 'DEMO%'),
    (select count(*) from public.customers where organization_id = v_org and mc_number ~ '^9000[0-4][0-9]$');
end $$;
