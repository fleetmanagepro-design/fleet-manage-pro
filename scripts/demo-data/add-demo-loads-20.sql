-- Demo loads: 20 loads with mixed statuses, on the demo trucks 201–220 with their drivers and the demo brokers.
-- Run in the Supabase SQL Editor AFTER scripts/demo-data/add-demo-40.sql (it needs those trucks, drivers and brokers).
--
--   8 delivered (last three weeks) · 3 in transit · 2 at pickup · 4 dispatched (next days) · 3 planned (unassigned)
--
-- Each load has a pickup (with pickup #) and a delivery at real facilities with ZIP and local time zone, so the
-- dispatch board, driver pay, statements and search have something to show. Running it again adds 20 more loads.
-- Company: the only one in the database, or the one named in v_org_name.

do $$
declare
  v_org_name text := null;  -- e.g. 'My Trucking LLC' when there is more than one company
  v_org uuid;
  v_count int;
  -- origin city, state, zip, tz, facility | destination city, state, zip, tz, facility | loaded miles
  lanes constant text[][] := array[
    array['Joliet','IL','60436','America/Chicago','Joliet Logistics Park','Columbus','OH','43215','America/New_York','Columbus Distribution Hub','355'],
    array['Chicago','IL','60607','America/Chicago','Chicago Cold Storage','Dallas','TX','75201','America/Chicago','Dallas Food Terminal','925'],
    array['Indianapolis','IN','46204','America/Indiana/Indianapolis','Circle City Warehouse','Atlanta','GA','30303','America/New_York','Peachtree Distribution','530'],
    array['Milwaukee','WI','53202','America/Chicago','Lakefront Paper Mill','Denver','CO','80202','America/Denver','Front Range DC','1040'],
    array['St. Louis','MO','63101','America/Chicago','Gateway Grain Co.','Memphis','TN','38103','America/Chicago','Riverside Freight Yard','285'],
    array['Louisville','KY','40202','America/New_York','Derby Auto Parts','Nashville','TN','37203','America/Chicago','Music City Retail DC','175'],
    array['Des Moines','IA','50309','America/Chicago','Prairie Foods Plant','Kansas City','MO','64105','America/Chicago','KC Crossdock','195'],
    array['Detroit','MI','48226','America/Detroit','Motor City Steel','Harrisburg','PA','17101','America/New_York','Keystone Retail DC','495'],
    array['Dallas','TX','75201','America/Chicago','Trinity Building Supply','Phoenix','AZ','85004','America/Phoenix','Desert Sun Warehouse','1065'],
    array['Columbus','OH','43215','America/New_York','Buckeye Packaging','Joliet','IL','60436','America/Chicago','Joliet Logistics Park','355']
  ];
  commodities constant text[] := array['Paper products','Frozen food','Building materials','Auto parts','Dairy','Retail goods'];
  n int;
  lane text[];
  st public.load_status;
  v_truck uuid;
  v_trailer uuid;
  v_broker uuid;
  v_load uuid;
  pickup timestamptz;
  delivery timestamptz;
  miles numeric;
  brokers uuid[];
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

  select array_agg(id order by mc_number) into brokers
  from public.customers where organization_id = v_org and mc_number ~ '^9000[0-4][0-9]$' and status = 'active';
  if brokers is null or (select count(*) from public.trucks where organization_id = v_org and unit_number ~ '^2(0[1-9]|1[0-9]|20)$') < 20 then
    raise exception 'Run scripts/demo-data/add-demo-40.sql first: this script uses its trucks 201–220, their drivers and the demo brokers.';
  end if;

  for n in 1..20 loop
    -- one row of the 2-D lanes array, as a flat text[]
    lane := array(select unnest(lanes[1 + (n - 1) % 10:1 + (n - 1) % 10][1:11]));
    miles := lane[11]::numeric + (n % 4) * 10;
    st := case
      when n <= 8 then 'delivered' when n <= 11 then 'in_transit' when n <= 13 then 'at_pickup'
      when n <= 17 then 'dispatched' else 'planned' end;
    -- delivered: picked up 2–20 days ago; in transit / at pickup: today or yesterday; dispatched / planned: coming days
    pickup := ((current_date + case
                  when st = 'delivered' then -(2 + (n - 1) * 2)
                  when st = 'in_transit' then -1
                  when st = 'at_pickup' then 0
                  else (n - 13) end)::timestamp + time '08:00') at time zone lane[4];
    delivery := pickup + interval '1 day' + (miles / 50) * interval '1 hour';
    v_broker := brokers[1 + (n - 1) % array_length(brokers, 1)];

    if st = 'planned' then
      v_truck := null;
      v_trailer := null;
    else
      select t.id into v_truck from public.trucks t
      where t.organization_id = v_org and t.unit_number = (200 + n)::text;
      select d.default_trailer_id into v_trailer from public.drivers d
      where d.organization_id = v_org and d.default_truck_id = v_truck limit 1;
    end if;

    insert into public.loads (organization_id, customer_id, customer_reference, status, truck_id, trailer_id,
      linehaul_cents, fuel_surcharge_cents, loaded_miles, deadhead_miles, commodity, weight_lbs, equipment_type, delivered_at)
    values (v_org, v_broker, 'PO-' || (61000 + n * 37), st, v_truck, v_trailer,
      (miles * (240 + (n % 6) * 15))::bigint, 0, miles, 20 + (n % 5) * 15,
      commodities[1 + n % 6], 34000 + (n % 6) * 1500,
      case when commodities[1 + n % 6] in ('Frozen food', 'Dairy') then 'reefer' else 'dry_van' end::public.trailer_type,
      case when st = 'delivered' then delivery end)
    returning id into v_load;

    insert into public.load_stops (organization_id, load_id, sequence, stop_type, facility_name, address_line1, city, state, zip,
      timezone, appointment_start, appointment_end, reference_number)
    values
      (v_org, v_load, 1, 'pickup', lane[5], (100 + n * 7) || ' Industrial Pkwy', lane[1], lane[2], lane[3], lane[4],
       pickup, pickup + interval '2 hours', 'PU-' || (48000 + n * 13)),
      (v_org, v_load, 2, 'delivery', lane[10], (200 + n * 11) || ' Commerce Dr', lane[6], lane[7], lane[8], lane[9],
       delivery, delivery + interval '2 hours', null);

    if v_truck is not null then
      insert into public.load_drivers (organization_id, load_id, driver_id, is_primary)
      select v_org, v_load, d.id, true
      from public.drivers d where d.organization_id = v_org and d.default_truck_id = v_truck
      order by d.last_name limit 1;
    end if;
  end loop;

  raise notice 'Added 20 demo loads to company %: 8 delivered, 3 in transit, 2 at pickup, 4 dispatched, 3 planned',
    (select name from public.organizations where id = v_org);
end $$;
