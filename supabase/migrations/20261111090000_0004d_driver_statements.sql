-- 0004d_driver_statements
-- Weekly driver pay statements (decisions of 11/10–11/11/2026, PRODUCT_SPEC §3 "Driver pay"):
--   * A week runs Monday–Sunday in the company time zone; a load belongs to the week of its first pickup.
--   * Statement = loads (owner-operator: value − company fee; company driver: miles × rate)
--     + driver extras − deductions (% of gross load value, or fixed per week) + balance carried in.
--   * If deductions are larger than earnings, the negative net is carried into the next statement as a debt.
--   * Company drivers can have deductions too (advances, escrow, …).
-- Drafts are computed by the app and never stored. Finalizing stores an immutable snapshot; a mistake is
-- fixed by voiding (with a reason) and finalizing again. Statements are finalized and voided in week order,
-- so the balance carried from one week to the next is always the net of the previous finalized statement.

create type public.statement_line_type as enum ('load', 'extra', 'deduction', 'carryover');

create table public.driver_statements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  driver_id uuid not null,
  week_start date not null check (extract(isodow from week_start) = 1),
  load_count int not null check (load_count >= 0),
  gross_cents bigint not null,
  company_fee_cents bigint not null,
  extras_cents bigint not null,
  deductions_cents bigint not null,
  carried_in_cents bigint not null check (carried_in_cents <= 0),
  net_cents bigint not null,
  finalized_by uuid default auth.uid(),
  finalized_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid,
  void_reason text,
  unique (organization_id, id),
  foreign key (organization_id, driver_id) references public.drivers (organization_id, id),
  constraint driver_statements_net check (
    net_cents = gross_cents - company_fee_cents + extras_cents - deductions_cents + carried_in_cents
  ),
  constraint driver_statements_void check (
    (voided_at is null and voided_by is null and void_reason is null)
    or (voided_at is not null and length(btrim(void_reason)) between 1 and 500)
  )
);
create index driver_statements_org_idx on public.driver_statements (organization_id);
-- One live statement per driver and week.
create unique index driver_statements_live_week on public.driver_statements (driver_id, week_start) where voided_at is null;

-- driver_deductions needs a composite key for the line FK below.
alter table public.driver_deductions add constraint driver_deductions_org_id_key unique (organization_id, id);

create table public.driver_statement_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  statement_id uuid not null,
  position int not null,
  line_type public.statement_line_type not null,
  load_id uuid,
  deduction_id uuid,
  description text not null check (length(description) between 1 and 300),
  detail text check (length(detail) <= 300),
  miles numeric(10, 1),
  value_cents bigint,
  fee_cents bigint,
  -- Effect on net pay: positive for earnings, negative for deductions and debt carried in.
  amount_cents bigint not null,
  foreign key (organization_id, statement_id) references public.driver_statements (organization_id, id),
  foreign key (organization_id, load_id) references public.loads (organization_id, id),
  foreign key (organization_id, deduction_id) references public.driver_deductions (organization_id, id),
  unique (statement_id, position),
  constraint driver_statement_lines_shape check (
    (line_type = 'load' and load_id is not null)
    or (line_type = 'extra' and load_id is not null and amount_cents > 0)
    or (line_type = 'deduction' and deduction_id is not null and amount_cents <= 0)
    or (line_type = 'carryover' and amount_cents < 0)
  )
);
create index driver_statement_lines_org_idx on public.driver_statement_lines (organization_id);
create index driver_statement_lines_statement_idx on public.driver_statement_lines (statement_id);
create index driver_statement_lines_load_idx on public.driver_statement_lines (load_id);

create trigger audit_driver_statements after insert or update on public.driver_statements
  for each row execute function public.audit_trigger();
create trigger audit_driver_statement_lines after insert on public.driver_statement_lines
  for each row execute function public.audit_trigger();

-- ---------------------------------------------------------------------------
-- Row Level Security: pay readers only; writes only through the functions below.
-- ---------------------------------------------------------------------------

alter table public.driver_statements enable row level security;
alter table public.driver_statement_lines enable row level security;

create policy "pay readers" on public.driver_statements
  for select to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin', 'accounting']::public.org_role[]));
create policy "pay readers" on public.driver_statement_lines
  for select to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin', 'accounting']::public.org_role[]));

revoke all on public.driver_statements, public.driver_statement_lines from anon;
revoke insert, update, delete, truncate on public.driver_statements, public.driver_statement_lines from authenticated;
grant select on public.driver_statements, public.driver_statement_lines to authenticated;

-- ---------------------------------------------------------------------------
-- Finalize: stores the snapshot the app computed, after checking it is consistent.
-- p_header: {load_count, gross_cents, company_fee_cents, extras_cents, deductions_cents, carried_in_cents, net_cents}
-- p_lines:  [{line_type, load_id, deduction_id, description, detail, miles, value_cents, fee_cents, amount_cents}]
-- ---------------------------------------------------------------------------

create or replace function public.finalize_driver_statement(
  p_org uuid,
  p_driver uuid,
  p_week date,
  p_header jsonb,
  p_lines jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_prev_net bigint;
  v_carried bigint;
  v_line jsonb;
  v_pos int := 0;
  v_load uuid;
  v_status public.load_status;
  v_number text;
begin
  if not public.has_org_role(p_org, array['owner', 'admin', 'accounting']::public.org_role[]) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  -- Serializes finalize/void for one driver.
  perform 1 from public.drivers where id = p_driver and organization_id = p_org for update;
  if not found then
    raise exception 'Driver not found' using errcode = '42501';
  end if;
  if p_week is null or extract(isodow from p_week) <> 1 then
    raise exception 'A pay week starts on a Monday' using errcode = '22023';
  end if;
  if p_week + 7 > public.org_today(p_org) then
    raise exception 'This week isn''t over yet' using errcode = 'P0001', hint = 'week_not_over';
  end if;
  if exists (select 1 from public.driver_statements
             where driver_id = p_driver and voided_at is null and week_start >= p_week) then
    raise exception 'A statement for this week or a later week is already finalized'
      using errcode = 'P0001', hint = 'statement_order';
  end if;

  select net_cents into v_prev_net from public.driver_statements
  where driver_id = p_driver and voided_at is null and week_start < p_week
  order by week_start desc limit 1;
  v_carried := least(coalesce(v_prev_net, 0), 0);
  if (p_header ->> 'carried_in_cents')::bigint is distinct from v_carried then
    raise exception 'The balance carried in has changed — reload the statement' using errcode = 'P0001', hint = 'statement_stale';
  end if;

  insert into public.driver_statements (organization_id, driver_id, week_start, load_count, gross_cents, company_fee_cents,
    extras_cents, deductions_cents, carried_in_cents, net_cents)
  values (p_org, p_driver, p_week, (p_header ->> 'load_count')::int, (p_header ->> 'gross_cents')::bigint,
    (p_header ->> 'company_fee_cents')::bigint, (p_header ->> 'extras_cents')::bigint,
    (p_header ->> 'deductions_cents')::bigint, v_carried, (p_header ->> 'net_cents')::bigint)
  returning id into v_id;

  for v_line in select * from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) loop
    v_pos := v_pos + 1;
    v_load := nullif(v_line ->> 'load_id', '')::uuid;
    if v_line ->> 'line_type' = 'load' then
      select l.status, l.load_number into v_status, v_number from public.loads l
      join public.load_drivers ld on ld.load_id = l.id and ld.driver_id = p_driver
      where l.id = v_load and l.organization_id = p_org;
      if v_status is null then
        raise exception 'A load on the statement is not this driver''s' using errcode = 'P0001', hint = 'statement_stale';
      end if;
      if v_status not in ('delivered', 'invoiced', 'paid') then
        raise exception 'Load % is not delivered yet', v_number using errcode = 'P0001', hint = 'statement_stale';
      end if;
      if exists (select 1 from public.driver_statement_lines sl join public.driver_statements s on s.id = sl.statement_id
                 where sl.load_id = v_load and sl.line_type = 'load' and s.driver_id = p_driver
                   and s.voided_at is null and s.id <> v_id) then
        raise exception 'Load % is already on another statement', v_number using errcode = 'P0001', hint = 'statement_stale';
      end if;
    end if;
    insert into public.driver_statement_lines (organization_id, statement_id, position, line_type, load_id, deduction_id,
      description, detail, miles, value_cents, fee_cents, amount_cents)
    values (p_org, v_id, v_pos, (v_line ->> 'line_type')::public.statement_line_type, v_load,
      nullif(v_line ->> 'deduction_id', '')::uuid, v_line ->> 'description', v_line ->> 'detail',
      (v_line ->> 'miles')::numeric, (v_line ->> 'value_cents')::bigint, (v_line ->> 'fee_cents')::bigint,
      (v_line ->> 'amount_cents')::bigint);
  end loop;

  if (select count(*) from public.driver_statement_lines where statement_id = v_id and line_type = 'load')
     <> (p_header ->> 'load_count')::int
     or (select coalesce(sum(amount_cents), 0) from public.driver_statement_lines where statement_id = v_id)
     <> (p_header ->> 'net_cents')::bigint
     or (select count(*) from public.driver_statement_lines where statement_id = v_id and line_type = 'carryover')
     <> (case when v_carried < 0 then 1 else 0 end) then
    raise exception 'Statement lines do not add up' using errcode = '22023';
  end if;
  return v_id;
end;
$$;
revoke execute on function public.finalize_driver_statement(uuid, uuid, date, jsonb, jsonb) from public, anon;
grant execute on function public.finalize_driver_statement(uuid, uuid, date, jsonb, jsonb) to authenticated;

create or replace function public.void_driver_statement(p_statement uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_s public.driver_statements;
begin
  select * into v_s from public.driver_statements where id = p_statement;
  if v_s.id is null or not public.has_org_role(v_s.organization_id, array['owner', 'admin', 'accounting']::public.org_role[]) then
    raise exception 'Statement not found' using errcode = '42501';
  end if;
  perform 1 from public.drivers where id = v_s.driver_id for update;
  if v_s.voided_at is not null then
    raise exception 'This statement is already void' using errcode = 'P0001', hint = 'statement_stale';
  end if;
  if length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'A reason is required' using errcode = 'P0001', hint = 'reason_required';
  end if;
  if exists (select 1 from public.driver_statements
             where driver_id = v_s.driver_id and voided_at is null and week_start > v_s.week_start) then
    raise exception 'Void the later statements first — they carry this balance' using errcode = 'P0001', hint = 'statement_order';
  end if;
  update public.driver_statements
  set voided_at = now(), voided_by = auth.uid(), void_reason = btrim(p_reason)
  where id = p_statement;
end;
$$;
revoke execute on function public.void_driver_statement(uuid, text) from public, anon;
grant execute on function public.void_driver_statement(uuid, text) to authenticated;
