-- 0008a_asset_documents
-- Documents attached to drivers, trucks and trailers (decision of 11/23/2026; first part of 0008_documents_alerts).
-- Files live in the private Storage bucket `documents` under {organization_id}/{entity}/{document_id}/{file name};
-- the browser uploads straight to Storage (Vercel caps request bodies far below 20 MB), then the app records the
-- document. Size and type are taken from Storage, never from the browser. PDF, JPG and PNG only, up to 20 MB.
-- Who may see and add documents follows the entity for now; roles get their final shape with the users work
-- (owner's decision). Documents are archived, never deleted.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 20971520, array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Text → uuid without raising (storage paths come from users).
create or replace function public.try_uuid(p text)
returns uuid
language sql immutable
set search_path = ''
as $$
  select case when p ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p::uuid end;
$$;

-- Roles that may see an entity's documents (drivers: like reading drivers; trucks/trailers: every member).
create or replace function public.can_view_documents(p_org uuid, p_entity text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select case p_entity
    when 'driver' then public.has_org_role(p_org, array['owner', 'admin', 'accounting', 'dispatcher', 'maintenance']::public.org_role[])
    when 'truck' then public.is_org_member(p_org)
    when 'trailer' then public.is_org_member(p_org)
    else false
  end;
$$;
revoke execute on function public.can_view_documents(uuid, text) from public, anon;
grant execute on function public.can_view_documents(uuid, text) to authenticated;

-- Everyone but viewers may add documents to what they can see (temporary, see header).
create or replace function public.can_add_documents(p_org uuid, p_entity text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select public.can_view_documents(p_org, p_entity)
     and public.has_org_role(p_org, array['owner', 'admin', 'accounting', 'dispatcher', 'maintenance']::public.org_role[]);
$$;
revoke execute on function public.can_add_documents(uuid, text) from public, anon;
grant execute on function public.can_add_documents(uuid, text) to authenticated;

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  entity_type text not null check (entity_type in ('driver', 'truck', 'trailer')),
  driver_id uuid,
  truck_id uuid,
  trailer_id uuid,
  doc_type text not null,
  file_name text not null check (length(btrim(file_name)) between 1 and 200),
  storage_path text not null unique,
  mime_type text not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png')),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 20971520),
  expires_on date,
  notes text check (length(notes) <= 1000),
  uploaded_by uuid default auth.uid(),
  uploaded_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid,
  foreign key (organization_id, driver_id) references public.drivers (organization_id, id),
  foreign key (organization_id, truck_id) references public.trucks (organization_id, id),
  foreign key (organization_id, trailer_id) references public.trailers (organization_id, id),
  constraint documents_one_entity check (
    (entity_type = 'driver' and driver_id is not null and truck_id is null and trailer_id is null)
    or (entity_type = 'truck' and truck_id is not null and driver_id is null and trailer_id is null)
    or (entity_type = 'trailer' and trailer_id is not null and driver_id is null and truck_id is null)
  ),
  constraint documents_type check (
    (entity_type = 'driver' and doc_type in ('cdl', 'medical_card', 'mvr', 'drug_test', 'application', 'other'))
    or (entity_type = 'truck' and doc_type in ('registration', 'insurance', 'annual_inspection', 'lease_title', 'permits', 'other'))
    or (entity_type = 'trailer' and doc_type in ('registration', 'annual_inspection', 'lease_title', 'other'))
  )
);
create index documents_org_idx on public.documents (organization_id);
create index documents_driver_idx on public.documents (driver_id) where driver_id is not null;
create index documents_truck_idx on public.documents (truck_id) where truck_id is not null;
create index documents_trailer_idx on public.documents (trailer_id) where trailer_id is not null;

-- The file must already be in Storage at the path the document's organization and entity imply;
-- its real size and type are copied from Storage.
create or replace function public.documents_check_file()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meta jsonb;
begin
  if split_part(new.storage_path, '/', 1) <> new.organization_id::text
     or split_part(new.storage_path, '/', 2) <> new.entity_type
     or split_part(new.storage_path, '/', 3) <> new.id::text then
    raise exception 'The file is not where this document''s organization keeps it' using errcode = '42501';
  end if;
  select metadata into v_meta from storage.objects where bucket_id = 'documents' and name = new.storage_path;
  if v_meta is null then
    raise exception 'The file was not uploaded' using errcode = 'P0001', hint = 'file_missing';
  end if;
  new.size_bytes := (v_meta ->> 'size')::bigint;
  new.mime_type := v_meta ->> 'mimetype';
  return new;
end;
$$;
revoke execute on function public.documents_check_file() from public, anon, authenticated;
create trigger documents_check_file before insert on public.documents
  for each row execute function public.documents_check_file();

create trigger audit_documents after insert or update on public.documents
  for each row execute function public.audit_trigger();

alter table public.documents enable row level security;
create policy "entity readers" on public.documents
  for select to authenticated using (public.can_view_documents(organization_id, entity_type));
create policy "entity uploaders" on public.documents
  for insert to authenticated with check (public.can_add_documents(organization_id, entity_type));

revoke all on public.documents from anon;
revoke update, delete, truncate on public.documents from authenticated;

-- Archive (owner/admin): the document leaves the list, the file and the record stay.
create or replace function public.archive_document(p_document uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  select organization_id into v_org from public.documents where id = p_document and archived_at is null;
  if v_org is null or not public.has_org_role(v_org, array['owner', 'admin']::public.org_role[]) then
    raise exception 'Document not found' using errcode = '42501';
  end if;
  update public.documents set archived_at = now(), archived_by = auth.uid() where id = p_document;
end;
$$;
revoke execute on function public.archive_document(uuid) from public, anon;
grant execute on function public.archive_document(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Storage policies: the first path segment is the organization, the second the entity type.
-- Files are added, read, never replaced or removed by users.
-- ---------------------------------------------------------------------------

create policy "documents: read by entity readers" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'documents'
    and public.can_view_documents(public.try_uuid(split_part(name, '/', 1)), split_part(name, '/', 2))
  );

create policy "documents: upload by entity uploaders" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'documents'
    and array_length(string_to_array(name, '/'), 1) = 4
    and public.can_add_documents(public.try_uuid(split_part(name, '/', 1)), split_part(name, '/', 2))
  );
