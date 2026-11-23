-- Tests for migration 0008a (documents on drivers, trucks, trailers + Storage policies). Run: npm run test:db
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
  (select id from public.drivers where last_name = 'Carter') as driver,
  (select id from public.trucks where organization_id = 'a0000000-0000-4000-8000-000000000001' and unit_number = '101') as truck,
  (select id from public.trucks where organization_id = 'b0000000-0000-4000-8000-000000000001' limit 1) as b_truck,
  '11111111-1111-4111-8111-111111111111'::uuid as d1,
  '22222222-2222-4222-8222-222222222222'::uuid as d2,
  '33333333-3333-4333-8333-333333333333'::uuid as d3;
grant select on ids to authenticated;

create function pg_temp.put(path text, size int, mime text) returns void language sql as $$
  insert into storage.objects (bucket_id, name, metadata) values ('documents', path, jsonb_build_object('size', size, 'mimetype', mime));
$$;
create function pg_temp.path(org uuid, entity text, doc uuid, file text) returns text language sql as $$
  select org::text || '/' || entity || '/' || doc::text || '/' || file;
$$;

select is((select public from storage.buckets where id = 'documents'), false, 'the documents bucket is private');
select is((select file_size_limit from storage.buckets where id = 'documents'), 20971520::bigint, 'files up to 20 MB');

-- =============================================================================
-- Upload + record (accounting, Org A)
-- =============================================================================
select pg_temp.login('10000000-0000-4000-8000-000000000005'); -- accounting
select lives_ok($$ select pg_temp.put(pg_temp.path((select a_org from ids), 'driver', (select d1 from ids), 'cdl.pdf'), 48213, 'application/pdf') $$,
  'accounting uploads a driver file to their organization');
select lives_ok($$ insert into public.documents (id, organization_id, entity_type, driver_id, doc_type, file_name, storage_path, mime_type, size_bytes, expires_on)
                   values ((select d1 from ids), (select a_org from ids), 'driver', (select driver from ids), 'cdl', 'cdl.pdf',
                     pg_temp.path((select a_org from ids), 'driver', (select d1 from ids), 'cdl.pdf'), 'image/png', 1, '2027-03-01') $$,
  'and records the document');
select is((select size_bytes || ' ' || mime_type from public.documents where id = (select d1 from ids)), '48213 application/pdf',
  'size and type come from Storage, not from the caller');
select throws_ok($$ insert into public.documents (id, organization_id, entity_type, driver_id, doc_type, file_name, storage_path, mime_type, size_bytes)
                    values ((select d2 from ids), (select a_org from ids), 'driver', (select driver from ids), 'cdl', 'x.pdf',
                      pg_temp.path((select a_org from ids), 'driver', (select d2 from ids), 'x.pdf'), 'application/pdf', 1) $$,
  'P0001', 'The file was not uploaded', 'a document needs its file in Storage');
select pg_temp.put(pg_temp.path((select a_org from ids), 'driver', (select d2 from ids), 'x.pdf'), 10, 'application/pdf');
select throws_ok($$ insert into public.documents (id, organization_id, entity_type, driver_id, doc_type, file_name, storage_path, mime_type, size_bytes)
                    values ((select d2 from ids), (select a_org from ids), 'driver', (select driver from ids), 'registration', 'x.pdf',
                      pg_temp.path((select a_org from ids), 'driver', (select d2 from ids), 'x.pdf'), 'application/pdf', 1) $$,
  '23514', null, 'a driver document can''t be a truck registration');
select throws_ok($$ select pg_temp.put('not-a-uuid/driver/x/y.pdf', 10, 'application/pdf') $$, '42501', null, 'paths must start with an organization');
select throws_ok($$ update public.documents set notes = 'x' $$, '42501', null, 'documents cannot be edited');
select throws_ok($$ delete from public.documents $$, '42501', null, 'documents cannot be deleted');
select throws_ok($$ select public.archive_document((select d1 from ids)) $$, '42501', null, 'only owner/admin remove documents');
select pg_temp.logout();

-- Truck document by maintenance
select pg_temp.login('10000000-0000-4000-8000-000000000004'); -- maintenance
select lives_ok($$ select pg_temp.put(pg_temp.path((select a_org from ids), 'truck', (select d3 from ids), 'reg.png'), 900, 'image/png') $$,
  'maintenance uploads a truck file');
select lives_ok($$ insert into public.documents (id, organization_id, entity_type, truck_id, doc_type, file_name, storage_path, mime_type, size_bytes)
                   values ((select d3 from ids), (select a_org from ids), 'truck', (select truck from ids), 'registration', 'reg.png',
                     pg_temp.path((select a_org from ids), 'truck', (select d3 from ids), 'reg.png'), 'image/png', 900) $$,
  'and records it');
select pg_temp.logout();

-- =============================================================================
-- Who sees what
-- =============================================================================
select pg_temp.login('10000000-0000-4000-8000-000000000006'); -- viewer
select is((select count(*)::int from public.documents where entity_type = 'driver'), 0, 'a viewer sees no driver documents');
select is((select count(*)::int from storage.objects where bucket_id = 'documents' and name like '%/driver/%'), 0, 'nor their files');
select is((select count(*)::int from public.documents where entity_type = 'truck'), 1, 'a viewer sees truck documents');
select throws_ok($$ select pg_temp.put(pg_temp.path((select a_org from ids), 'truck', gen_random_uuid(), 'v.pdf'), 10, 'application/pdf') $$,
  '42501', null, 'a viewer cannot upload');
select pg_temp.logout();

select pg_temp.login('10000000-0000-4000-8000-000000000003'); -- dispatcher
select is((select count(*)::int from public.documents), 2, 'a dispatcher sees driver and truck documents');
select pg_temp.logout();

-- =============================================================================
-- Isolation
-- =============================================================================
select pg_temp.login('20000000-0000-4000-8000-000000000001'); -- Org B owner
select is((select count(*)::int from public.documents where organization_id = (select a_org from ids)), 0, 'Org B cannot read Org A documents');
select is((select count(*)::int from storage.objects where bucket_id = 'documents' and name like (select a_org from ids)::text || '/%'), 0,
  'Org B cannot read Org A files');
select throws_ok($$ select pg_temp.put(pg_temp.path((select a_org from ids), 'truck', gen_random_uuid(), 'b.pdf'), 10, 'application/pdf') $$,
  '42501', null, 'Org B cannot upload into Org A');
select throws_ok($$ select public.archive_document((select d3 from ids)) $$, '42501', null, 'Org B cannot remove Org A documents');
-- A file of Org B can't be recorded on an Org A truck
select lives_ok($$ select pg_temp.put(pg_temp.path((select b_org from ids), 'truck', (select d2 from ids), 'b.pdf'), 10, 'application/pdf') $$,
  'Org B uploads its own file');
select throws_ok($$ insert into public.documents (id, organization_id, entity_type, truck_id, doc_type, file_name, storage_path, mime_type, size_bytes)
                    values ((select d2 from ids), (select b_org from ids), 'truck', (select truck from ids), 'registration', 'b.pdf',
                      pg_temp.path((select b_org from ids), 'truck', (select d2 from ids), 'b.pdf'), 'application/pdf', 10) $$,
  '23503', null, 'Org B cannot attach a document to an Org A truck');
select pg_temp.logout();

-- =============================================================================
-- Archive
-- =============================================================================
select pg_temp.login('10000000-0000-4000-8000-000000000002'); -- admin
select lives_ok($$ select public.archive_document((select d3 from ids)) $$, 'admin removes a document');
select pg_temp.logout();
select isnt((select archived_at from public.documents where id = (select d3 from ids)), null, 'it is archived, not deleted');
select is((select count(*)::int from storage.objects where name = pg_temp.path((select a_org from ids), 'truck', (select d3 from ids), 'reg.png')), 1,
  'the file is kept');
select ok((select count(*) from public.audit_logs where table_name = 'documents') >= 3, 'document changes are audited');

select * from finish();
rollback;
