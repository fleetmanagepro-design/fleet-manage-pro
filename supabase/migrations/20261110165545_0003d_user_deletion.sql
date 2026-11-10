-- 0003d_user_deletion
-- Deleting a user (Supabase → Authentication → Users) failed with "Database error":
--   * audit_logs.actor_id referenced auth.users ON DELETE SET NULL, but audit_logs is
--     insert-only, so the SET NULL update was rejected for anyone who had ever acted.
--   * the same SET NULL on created_by hit the "pay rule in effect" and "sold asset is
--     read-only" guards.
-- Audit history must survive the user, so actor_id keeps the id without a foreign key.
-- The guards now ignore changes that only touch who-columns maintained by the system.
-- Deleting the last owner of an organization is still refused, on purpose.

alter table public.audit_logs drop constraint audit_logs_actor_id_fkey;
comment on column public.audit_logs.actor_id is
  'auth.users id of whoever made the change; kept after the user is deleted (no foreign key).';

-- Pay rules in effect stay immutable, except for created_by being cleared on user deletion.
create or replace function public.driver_pay_rules_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := public.org_today(old.organization_id);
begin
  if tg_op = 'UPDATE'
     and (to_jsonb(new) - 'created_by' - 'updated_at') = (to_jsonb(old) - 'created_by' - 'updated_at') then
    return new;
  end if;
  -- Check access before revealing anything (this function bypasses RLS).
  if (select auth.uid()) is not null
     and not public.has_org_role(old.organization_id, array['owner', 'admin', 'accounting']::public.org_role[]) then
    raise exception 'You don''t have permission to change pay rules' using errcode = '42501';
  end if;
  if old.effective_from <= v_today then
    raise exception 'A pay rule that is already in effect cannot be changed; add a new rule instead'
      using errcode = 'P0001', hint = 'pay_rule_in_effect';
  end if;
  if tg_op = 'UPDATE' and new.effective_from <= v_today then
    raise exception 'A changed pay rule must start in the future' using errcode = 'P0001', hint = 'pay_rule_in_effect';
  end if;
  return coalesce(new, old);
end;
$$;

-- Sold assets stay read-only, except for system-maintained columns (now including created_by).
create or replace function public.fleet_asset_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_system text[] := array['updated_at', 'archived_at', 'archived_by', 'created_by',
                           'current_odometer', 'hubodometer', 'reefer_hours'];
  v_old jsonb := to_jsonb(old);
  v_new jsonb := to_jsonb(new);
  v_col text;
  v_meter text;
begin
  -- Dispatchers (the only other role RLS lets through) may change status only.
  if v_actor is not null
     and not public.has_org_role(old.organization_id, array['owner', 'admin', 'maintenance']::public.org_role[])
     and (v_new - 'status' - 'updated_at') <> (v_old - 'status' - 'updated_at') then
    raise exception 'Dispatchers can only change the status' using errcode = '42501';
  end if;

  -- Selling and un-selling is an owner/admin decision.
  if (old.status = 'sold') <> (new.status = 'sold')
     and v_actor is not null
     and not public.has_org_role(old.organization_id, array['owner', 'admin']::public.org_role[]) then
    raise exception 'Only an owner or admin can change a sold status' using errcode = '42501', hint = 'sold_status';
  end if;

  -- A sold asset is read-only.
  if old.status = 'sold' and new.status = 'sold' then
    foreach v_col in array v_system loop
      v_old := v_old - v_col;
      v_new := v_new - v_col;
    end loop;
    if v_new <> v_old then
      raise exception 'A sold asset is read-only' using errcode = 'P0001', hint = 'sold_read_only';
    end if;
  end if;

  -- Meters only go up, unless a correction is being applied by record_meter_reading.
  foreach v_meter in array array['current_odometer', 'hubodometer', 'reefer_hours'] loop
    if (to_jsonb(new) ->> v_meter)::numeric < (to_jsonb(old) ->> v_meter)::numeric
       and coalesce(current_setting('fmp.meter_correction', true), '') <> 'on' then
      raise exception 'Meter readings can only increase' using errcode = 'P0001', hint = 'meter_decrease';
    end if;
  end loop;

  -- Who archived it.
  if old.archived_at is null and new.archived_at is not null then
    new.archived_by := v_actor;
  elsif new.archived_at is null then
    new.archived_by := null;
  end if;

  return new;
end;
$$;
