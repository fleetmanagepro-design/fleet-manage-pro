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
