-- Local development seed. Runs on `npx supabase db reset`.
-- Two organizations for tenant-isolation testing (docs/DATABASE_SCHEMA.md §6).
-- So far it seeds tenancy only; later migrations extend it with fleet,
-- loads, expenses and maintenance data.
--
-- Every seeded user signs in with the password: Password123!
-- (local development only; these accounts never exist in production)

-- ---------------------------------------------------------------------------
-- Users
-- ---------------------------------------------------------------------------

with seed_users (id, email, first_name, last_name) as (
  values
    ('10000000-0000-4000-8000-000000000001'::uuid, 'owner@lakesidefreight.test',       'Mark',   'Lindqvist'),
    ('10000000-0000-4000-8000-000000000002'::uuid, 'admin@lakesidefreight.test',       'Dana',   'Price'),
    ('10000000-0000-4000-8000-000000000003'::uuid, 'dispatch@lakesidefreight.test',    'Luis',   'Ortega'),
    ('10000000-0000-4000-8000-000000000004'::uuid, 'shop@lakesidefreight.test',        'Ray',    'Kowalski'),
    ('10000000-0000-4000-8000-000000000005'::uuid, 'accounting@lakesidefreight.test',  'Janet',  'Hughes'),
    ('10000000-0000-4000-8000-000000000006'::uuid, 'viewer@lakesidefreight.test',      'Tom',    'Becker'),
    ('20000000-0000-4000-8000-000000000001'::uuid, 'owner@prairiehaul.test',           'Sarah',  'Mendez')
)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select
  '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated', email,
  extensions.crypt('Password123!', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('first_name', first_name, 'last_name', last_name),
  now(), now(), '', '', '', ''
from seed_users;

insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), id, id::text, 'email',
  jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true),
  now(), now(), now()
from auth.users
where email like '%.test';

-- ---------------------------------------------------------------------------
-- Organizations
-- ---------------------------------------------------------------------------

insert into public.organizations
  (id, name, usdot_number, mc_number, address_line1, city, state, zip, timezone, created_by)
values
  ('a0000000-0000-4000-8000-000000000001', 'Lakeside Freight LLC', '3141592', '1088421',
   '2200 Industrial Pkwy', 'Joliet', 'IL', '60436', 'America/Chicago',
   '10000000-0000-4000-8000-000000000001'),
  ('b0000000-0000-4000-8000-000000000001', 'Prairie Haul Inc', '2718281', null,
   '815 County Rd 12', 'Kearney', 'NE', '68847', 'America/Chicago',
   '20000000-0000-4000-8000-000000000001');

insert into public.organization_members (organization_id, user_id, role) values
  ('a0000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'owner'),
  ('a0000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 'admin'),
  ('a0000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003', 'dispatcher'),
  ('a0000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000004', 'maintenance'),
  ('a0000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000005', 'accounting'),
  ('a0000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000006', 'viewer'),
  ('b0000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'owner');

-- ---------------------------------------------------------------------------
-- Fleet (0003): Lakeside 12 trucks / 18 trailers, Prairie Haul 3 / 4.
-- Dates are relative to today so compliance warnings always show something.
-- ---------------------------------------------------------------------------

-- VIN check digit (position 9), so seeded VINs are realistic.
create function pg_temp.vin_with_check(base text) returns text language plpgsql as $$
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

insert into public.trucks
  (organization_id, unit_number, vin, year, make, model, plate, plate_state, ownership,
   purchase_date, purchase_price_cents, status, registration_expires_on, annual_inspection_on,
   annual_inspection_valid_months, insurance_expires_on)
select
  'a0000000-0000-4000-8000-000000000001',
  (100 + n)::text,
  pg_temp.vin_with_check((array['1FUJHHDR','1XKYD49X','1XPBD49X','4V4NC9EH'])[1 + n % 4] || '0' ||
                         (array['J','K','L','M','N','P'])[1 + n % 6] || 'P' || lpad((48210 + n * 137)::text, 6, '0')),
  2017 + n % 8,
  (array['Freightliner','Kenworth','Peterbilt','Volvo'])[1 + n % 4],
  (array['Cascadia','T680','579','VNL 760'])[1 + n % 4],
  'P' || lpad((731000 + n)::text, 6, '0'), 'IL',
  (array['owned','financed','leased']::public.ownership_type[])[1 + n % 3],
  current_date - (400 * (1 + n % 5)), (8900000 + n * 125000)::bigint,
  case n when 4 then 'in_shop' when 9 then 'out_of_service' else 'active' end::public.asset_status,
  case n when 2 then current_date + 12 when 7 then current_date - 3 else current_date + 90 + n * 17 end,
  case n when 5 then current_date - 350 when 11 then current_date - 170 else current_date - 30 * n end,
  case n when 11 then 6 else 12 end,  -- truck 111: 6-month inspection, due soon
  current_date + 120 + n * 5
from generate_series(1, 12) n;

insert into public.trucks
  (organization_id, unit_number, vin, year, make, model, plate, plate_state, status,
   registration_expires_on, annual_inspection_on, insurance_expires_on)
select 'b0000000-0000-4000-8000-000000000001', 'PH' || n,
  pg_temp.vin_with_check('3AKJHHDR0' || chr(ascii('K') + n) || 'S' || lpad((10500 + n)::text, 6, '0')),
  2019 + n, 'Freightliner', 'Cascadia', 'NE' || lpad(n::text, 5, '0'), 'NE', 'active',
  current_date + 200, current_date - 60, current_date + 180
from generate_series(1, 3) n;

-- Odometer history: three readings over the last six months per truck.
insert into public.odometer_readings (organization_id, asset_type, truck_id, reading, reading_type, read_on, source)
select t.organization_id, 'truck', t.id,
  (180000 + (row_number() over (order by t.unit_number)) * 41000 + k * 9500)::numeric(10, 1),
  'odometer', current_date - (180 - k * 60), 'manual'
from public.trucks t, generate_series(0, 2) k
order by t.unit_number, k;

insert into public.trailers
  (organization_id, unit_number, vin, year, make, trailer_type, length_ft, plate, plate_state, ownership,
   purchase_date, purchase_price_cents, status, registration_expires_on, annual_inspection_on)
select
  'a0000000-0000-4000-8000-000000000001',
  (5300 + n)::text,
  pg_temp.vin_with_check((array['1UYVS253','1JJV532D','1GRAA062'])[1 + n % 3] || '0' ||
                         (array['J','K','L','M','N','P'])[1 + n % 6] || 'M' || lpad((70100 + n * 53)::text, 6, '0')),
  2014 + n % 10,
  (array['Utility','Wabash','Great Dane'])[1 + n % 3],
  case when n <= 10 then 'dry_van' when n <= 16 then 'reefer' else 'flatbed' end::public.trailer_type,
  case when n % 5 = 0 then 48 else 53 end,
  'T' || lpad((88000 + n)::text, 6, '0'), 'IL',
  (array['owned','leased']::public.ownership_type[])[1 + n % 2],
  current_date - (300 * (1 + n % 6)), (3200000 + n * 90000)::bigint,
  case n when 6 then 'in_shop' else 'active' end::public.asset_status,
  case n when 3 then current_date + 20 when 14 then current_date - 10 else current_date + 60 + n * 11 end,
  case n when 11 then current_date - 355 else current_date - 20 * n end
from generate_series(1, 18) n;

insert into public.trailers (organization_id, unit_number, year, make, trailer_type, length_ft, status,
  registration_expires_on, annual_inspection_on)
select 'b0000000-0000-4000-8000-000000000001', 'PHT' || n, 2016 + n, 'Wabash',
  case when n = 4 then 'reefer' else 'dry_van' end::public.trailer_type, 53, 'active',
  current_date + 150, current_date - 90
from generate_series(1, 4) n;

-- Reefer hours and hubodometer for some Lakeside trailers.
insert into public.odometer_readings (organization_id, asset_type, trailer_id, reading, reading_type, read_on)
select organization_id, 'trailer', id, (4200 + unit_number::int % 100 * 310)::numeric(10, 1), 'reefer_hours', current_date - 14
from public.trailers where trailer_type = 'reefer' and organization_id = 'a0000000-0000-4000-8000-000000000001';

insert into public.odometer_readings (organization_id, asset_type, trailer_id, reading, reading_type, read_on)
select organization_id, 'trailer', id, (95000 + unit_number::int % 100 * 7300)::numeric(10, 1), 'hubodometer', current_date - 30
from public.trailers where unit_number in ('5301', '5302', '5303', '5304');

-- ---------------------------------------------------------------------------
-- Drivers (0003b): Lakeside 14, Prairie Haul 3, each with pay-rule history.
-- Drivers 1–12 run trucks 101–112; 13 is a team partner on truck 105; 14 is inactive.
-- ---------------------------------------------------------------------------

with names (n, first_name, last_name) as (
  values (1, 'James', 'Carter'), (2, 'Maria', 'Gonzalez'), (3, 'Robert', 'Hill'), (4, 'Linda', 'Brooks'),
         (5, 'Michael', 'Reed'), (6, 'Patricia', 'Ward'), (7, 'David', 'Foster'), (8, 'Jennifer', 'Price'),
         (9, 'William', 'Hayes'), (10, 'Elizabeth', 'Myers'), (11, 'Richard', 'Long'), (12, 'Susan', 'Coleman'),
         (13, 'Thomas', 'Reed'), (14, 'Karen', 'Bishop')
)
insert into public.drivers
  (organization_id, first_name, last_name, phone, email, driver_type, hire_date, status,
   cdl_number, cdl_state, cdl_class, cdl_expires_on, medical_card_expires_on, default_truck_id,
   emergency_contact_name, emergency_contact_phone)
select
  'a0000000-0000-4000-8000-000000000001', first_name, last_name,
  '(815) 555-' || lpad((100 + n)::text, 4, '0'),
  lower(first_name) || '.' || lower(last_name) || '@drivers.lakesidefreight.test',
  case when n in (5, 13) then 'team' when n in (11, 12) then 'owner_operator' else 'company' end::public.driver_type,
  current_date - (200 + n * 90),
  case when n = 14 then 'inactive' else 'active' end::public.driver_status,
  'L' || lpad((40002000 + n * 731)::text, 11, '0'), 'IL', 'A',
  case n when 3 then current_date + 20 when 6 then current_date + 45 when 9 then current_date - 5
         else current_date + 400 + n * 30 end,
  case n when 4 then current_date + 25 when 8 then current_date + 55 else current_date + 300 + n * 10 end,
  (select id from public.trucks t
    where t.organization_id = 'a0000000-0000-4000-8000-000000000001'
      and t.unit_number = (case when n = 13 then 105 when n <= 12 then 100 + n end)::text),
  'Emergency contact ' || n, '(815) 555-' || lpad((900 + n)::text, 4, '0')
from names;

insert into public.drivers (organization_id, first_name, last_name, phone, driver_type, hire_date, status,
  cdl_number, cdl_state, cdl_class, cdl_expires_on, medical_card_expires_on, default_truck_id)
select 'b0000000-0000-4000-8000-000000000001', f, l, '(308) 555-01' || n, 'company', current_date - 500, 'active',
  'H' || lpad((5100 + n)::text, 8, '0'), 'NE', 'A', current_date + 600, current_date + 200,
  (select id from public.trucks where organization_id = 'b0000000-0000-4000-8000-000000000001' and unit_number = 'PH' || n)
from (values (1, 'Gary', 'Olsen'), (2, 'Ruth', 'Lindgren'), (3, 'Dale', 'Becker')) v(n, f, l);

-- Pay rules: company drivers per mile (with a raise this year), team drivers per mile on all miles,
-- owner-operators a percentage of linehaul + FSC; one future raise to show an editable rule.
insert into public.driver_pay_rules (organization_id, driver_id, effective_from, pay_type, rate_cents_per_mile, miles_basis,
  stop_pay_cents, detention_pay_cents_per_hour)
select d.organization_id, d.id, d.hire_date, 'per_mile', case when d.driver_type = 'team' then 32 else 55 end,
  case when d.driver_type = 'team' then 'all' else 'loaded' end::public.miles_basis, 5000, 2000
from public.drivers d where d.driver_type in ('company', 'team');

insert into public.driver_pay_rules (organization_id, driver_id, effective_from, pay_type, rate_cents_per_mile, miles_basis,
  stop_pay_cents, detention_pay_cents_per_hour)
select d.organization_id, d.id, current_date - 60, 'per_mile', 58, 'loaded', 5000, 2500
from public.drivers d where d.driver_type = 'company' and d.status = 'active' and d.hire_date < current_date - 60;

insert into public.driver_pay_rules (organization_id, driver_id, effective_from, pay_type, percent, percent_basis)
select d.organization_id, d.id, d.hire_date, 'percent', 72.00, 'linehaul_fsc'
from public.drivers d where d.driver_type = 'owner_operator';

insert into public.driver_pay_rules (organization_id, driver_id, effective_from, pay_type, rate_cents_per_mile, miles_basis,
  stop_pay_cents, detention_pay_cents_per_hour, notes)
select d.organization_id, d.id, current_date + 21, 'per_mile', 60, 'loaded', 5000, 2500, 'Annual raise'
from public.drivers d where d.last_name = 'Carter' and d.organization_id = 'a0000000-0000-4000-8000-000000000001';
