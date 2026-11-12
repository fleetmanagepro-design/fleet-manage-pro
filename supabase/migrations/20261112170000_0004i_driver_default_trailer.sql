-- 0004i_driver_default_trailer
-- Equipment is tied to the driver (decision of 11/12/2026): a driver has a default truck (0003b) and now a
-- default trailer. Picking the driver on a load fills both in; they can still be changed on the load.

alter table public.drivers add column default_trailer_id uuid;
alter table public.drivers add constraint drivers_organization_id_default_trailer_id_fkey
  foreign key (organization_id, default_trailer_id) references public.trailers (organization_id, id);
create index drivers_default_trailer_idx on public.drivers (default_trailer_id) where default_trailer_id is not null;

grant update (default_trailer_id) on public.drivers to authenticated;
