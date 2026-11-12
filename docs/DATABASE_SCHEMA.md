# Fleet Manage Pro — Database Schema (MVP)

PostgreSQL on Supabase. This document is the design; the actual SQL lives in `supabase/migrations/`.

## 1. Conventions

- Primary keys: `id uuid primary key default gen_random_uuid()`
- Every business table: `organization_id uuid not null references organizations(id)`
- Timestamps: `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()` (trigger), `created_by uuid references auth.users(id)`
- Money: `bigint` in **cents** (column suffix `_cents`)
- Miles: `numeric(10,1)`; gallons: `numeric(10,3)`
- Dates without time (expiry dates, expense dates): `date`
- Enums: Postgres enums for stable sets (statuses); lookup tables for user-editable lists (expense categories)
- Soft delete / void: `voided_at timestamptz`, `voided_by uuid`, `void_reason text` on financial tables; `archived_at` on master data
- Indexes: every `organization_id`, every foreign key, and common filters (status, dates)
- Names: snake_case, plural tables

## 2. Tenancy and access

```sql
create type org_role as enum ('owner','admin','dispatcher','maintenance','accounting','viewer');

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  usdot_number text,
  mc_number text,
  address_line1 text, city text, state char(2), zip text,
  timezone text not null default 'America/Chicago',
  overhead_allocation text not null default 'by_miles'
    check (overhead_allocation in ('by_miles','per_truck','none')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table organization_members (
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role org_role not null,
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  email text not null,
  role org_role not null,
  token_hash text not null,
  expires_at timestamptz not null,
  accepted_at timestamptz
);
```

### Helper functions (used by RLS)

```sql
-- Is the current user a member of this org?
create or replace function public.is_org_member(org uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from organization_members
    where organization_id = org and user_id = (select auth.uid())
  );
$$;

-- Does the current user have one of these roles in this org?
create or replace function public.has_org_role(org uuid, roles org_role[])
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from organization_members
    where organization_id = org
      and user_id = (select auth.uid())
      and role = any(roles)
  );
$$;
```

### RLS pattern (apply to every business table)

```sql
alter table trucks enable row level security;

create policy "members read" on trucks
  for select using (public.is_org_member(organization_id));

create policy "editors insert" on trucks
  for insert with check (
    public.has_org_role(organization_id, array['owner','admin','dispatcher','maintenance']::org_role[])
  );

create policy "editors update" on trucks
  for update using (
    public.has_org_role(organization_id, array['owner','admin','dispatcher','maintenance']::org_role[])
  ) with check (
    public.has_org_role(organization_id, array['owner','admin','dispatcher','maintenance']::org_role[])
  );

-- No delete policy on financial tables: voiding only.
```

Role matrix per table is defined in §5. Financial visibility for dispatchers (company P&L) is restricted at the query/view level, not only in UI.

## 3. Tables by module

### Customers
**customers**: id, organization_id, name, customer_type (`broker`/`shipper`/`both`), mc_number (unique per org among non-archived), billing_email, phone, payment_terms_days int 0–180 default 30, address fields, notes, status (`active`/`inactive`/`do_not_use`), do_not_use_reason (required for do_not_use), archived_at
**customer_contacts**: id, organization_id, customer_id (composite FK), name, email, phone, role

### Fleet
**trucks**: id, organization_id, unit_number (unique per org), vin, year, make, model, plate, plate_state, ownership (`owned`/`financed`/`leased`), purchase_date, purchase_price_cents, current_odometer numeric(10,1), status (`active`/`in_shop`/`out_of_service`/`sold`), registration_expires_on, annual_inspection_on, annual_inspection_valid_months (3/6/9/12, default 12), insurance_expires_on, notes, archived_at

**trailers**: id, organization_id, unit_number (unique per org), vin, year, make, trailer_type (`dry_van`/`reefer`/`flatbed`/`step_deck`/`other`), length_ft, plate, plate_state, ownership, purchase_date, purchase_price_cents, hubodometer numeric(10,1), reefer_hours numeric(10,1), status, registration_expires_on, annual_inspection_on, annual_inspection_valid_months, notes, archived_at

**odometer_readings**: id, organization_id, asset_type (`truck`/`trailer`), truck_id, trailer_id, reading numeric(10,1), reading_type (`odometer`/`hubodometer`/`reefer_hours`), read_on date, source (`manual`/`fuel`/`work_order`/`load`), is_correction bool, note — insert-only
— check: exactly one of truck_id / trailer_id is set (same pattern used below wherever an asset is referenced)
— the asset's current meter values are maintained from these readings by triggers; users can't write them directly

**Cross-tenant references**: every table that references another tenant-owned row uses a composite foreign key `(organization_id, x_id) → x(organization_id, id)` so a row can never point at another organization's record (implemented from `0003_fleet` on; `trucks`/`trailers` carry `unique (organization_id, id)` for this).
A truck's drivers are `drivers.default_truck_id = trucks.id` (no `trucks.default_driver_id`, so there is one source of truth and teams work).

### Drivers
**drivers**: id, organization_id, first_name, last_name, phone, email, driver_type (`company`/`owner_operator`/`team`), hire_date, status (`active`/`inactive`/`terminated`), cdl_number, cdl_state, cdl_class (`A`/`B`/`C`), cdl_expires_on, medical_card_expires_on, default_truck_id, emergency_contact_name, emergency_contact_phone, notes, archived_at — CDL unique per (org, state, number) among non-archived

**driver_pay_rules**: id, organization_id, driver_id, effective_from date, pay_type (`per_mile`/`percent`/`flat`), rate_cents_per_mile int, miles_basis (`loaded`/`all`), percent numeric(5,2), percent_basis (`linehaul`/`linehaul_fsc`/`total`), flat_cents bigint, stop_pay_cents bigint, detention_pay_cents_per_hour bigint
— owner-operators: `pay_type = 'percent'`, `percent` = driver share (100 − company fee), `percent_basis = 'total'`; company drivers: `per_mile`
— latest rule with `effective_from <=` the load's first pickup day (org time zone) applies; unique (driver_id, effective_from); a check constraint allows exactly the fields of the pay type; rules with `effective_from <= org_today(org)` can't be updated or deleted (trigger)

**driver_deductions** (`0004c`, `0004e`): id, organization_id, driver_id, name, kind (`percent_of_gross`/`fixed_weekly`/`per_mile`), percent numeric(5,2), amount_cents bigint, rate_cents_per_mile int, free_miles numeric(10,1), starts_on, ends_on, notes, created_by — check: percent only for `percent_of_gross`; amount_cents for `fixed_weekly`; `per_mile` = rate + free miles per week (+ optional weekly amount_cents); never deleted (end with `ends_on`); only name, ends_on, notes updatable; owner/admin/accounting only

**driver_statements** (`0004d`): id, organization_id, driver_id, week_start date (Monday), load_count, gross_cents,
company_fee_cents, extras_cents, deductions_cents, carried_in_cents (≤ 0), net_cents, finalized_by, finalized_at, voided_at,
voided_by, void_reason — check: net = gross − fee + extras − deductions + carried_in; one live (not voided) statement per driver
and week; written only by `finalize_driver_statement()` / `void_driver_statement()` (security definer, role-checked; finalize
and void in week order, carried_in = previous live net if negative); owner/admin/accounting read
**driver_statement_lines** (`0004d`): id, organization_id, statement_id, position, line_type (`load`/`extra`/`deduction`/`carryover`),
load_id, deduction_id, description, detail, miles, value_cents, fee_cents, amount_cents (effect on net) — insert-only snapshot;
lines must add up to the net; a load is on one live statement per driver

**us_zip_codes** (`0004f`): zip (pk), city, state, timezone. Reference data shared by every organization: the one table
without `organization_id`, because it holds no tenant data. Every signed-in user can read it and no one can write it.
Sources in `docs/THIRD_PARTY_DATA.md`.
**facilities** (`0004g`): id, organization_id, name, address_line1, city, state, zip, timezone, notes, use_count,
last_used_at, archived_at, created_by.
- Unique per organization on lower(name) + lower(street) + ZIP.
- Written by the `load_stops` insert trigger `remember_stop_facility()`, never inserted directly.
- Members read; owner/admin/dispatcher may correct or archive (column grants).
- No delete.

### Loads & dispatch
```
load_status: planned, dispatched, at_pickup, in_transit, delivered, invoiced, paid, cancelled
```
**loads**: id, organization_id, load_number (auto per org via `organization_counters`, editable, unique case-insensitive), customer_id, customer_reference, status load_status, truck_id, trailer_id, linehaul_cents, fuel_surcharge_cents (not used since 11/12/2026: the app saves 0; older rows keep theirs), loaded_miles, deadhead_miles, commodity, weight_lbs, equipment_type, delivered_at timestamptz, cancelled_reason, is_tonu bool, notes — status, delivered_at and cancelled_reason change only through `change_load_status()`; loads are saved with stops and drivers in one transaction by `save_load()`
**load_drivers**: load_id, driver_id, organization_id, is_primary — supports team loads
**load_stops**: id, organization_id, load_id, sequence int, stop_type (`pickup`/`delivery`), facility_name, address_line1, city, state, zip, timezone (IANA, facility local time), appointment_start, appointment_end, arrived_at, departed_at, notes
**load_accessorials**: id, organization_id, load_id, type (`detention`/`layover`/`lumper`/`tonu`/`stop_off`/`on_time_bonus`/`late_penalty`/`other`), amount_cents, billable_to_customer bool, notes — `late_penalty` is subtracted from the load value
**load_driver_items** (`0004c`): id, organization_id, load_id, driver_id, description, amount_cents > 0, created_by, created_at — extras paid to a driver on the load in full (no company fee); the driver must be on the load; insert/delete only; owner/admin/dispatcher/accounting
**load_events**: id, organization_id, load_id, kind (`status_change`/`assignment_override`), from_status, to_status, reason, created_by (no FK), created_at — insert-only

Computed (view `load_financials`): total_revenue_cents, total_miles, rpm, direct_costs_cents, contribution_cents.

### Expenses
**expense_categories**: id, organization_id, name, kind (`fuel`/`driver_pay`/`maintenance`/`tires`/`fixed`/`variable`/`overhead`), is_system bool
**expenses**: id, organization_id, expense_date date, category_id, amount_cents, vendor, payment_method, level (`load`/`truck`/`trailer`/`company`), load_id, truck_id, trailer_id, driver_id (optional, for driver pay), description, work_order_id, recurring_cost_id, voided_at, voided_by, void_reason
— check: level matches which FK is set
**fuel_details**: expense_id (pk, fk), organization_id, gallons numeric(10,3), price_per_gallon_cents int, state char(2), odometer numeric(10,1), is_def bool
**recurring_costs**: id, organization_id, name, category_id, amount_cents, frequency (`weekly`/`monthly`/`yearly`), level, truck_id, trailer_id, starts_on, ends_on, last_generated_on

### Maintenance
**work_orders**: id, organization_id, work_order_number, asset_type, truck_id, trailer_id, wo_type (`repair`/`preventive`/`inspection`/`breakdown`/`tire`), status (`open`/`closed`/`voided`), opened_on, closed_on, odometer_at_service, vendor, in_house bool, downtime_days numeric(5,1), description, pm_schedule_id
**work_order_lines**: id, organization_id, work_order_id, line_type (`part`/`labor`/`fee`), description, quantity numeric(10,2), unit_cost_cents, total_cents
**pm_templates**: id, organization_id, name, applies_to (`truck`/`trailer`/`reefer`), interval_miles, interval_days, interval_hours
**pm_schedules**: id, organization_id, pm_template_id, asset_type, truck_id, trailer_id, last_done_on, last_done_miles, next_due_on, next_due_miles — recomputed when a linked work order closes
**tires**: id, organization_id, brand, model, size, dot_code, purchased_on, cost_cents, status (`in_service`/`spare`/`retread`/`scrapped`), current_asset_type, current_truck_id, current_trailer_id, current_position text
**tire_events**: id, organization_id, tire_id, event_type (`mounted`/`removed`/`rotated`/`tread_check`/`repaired`/`scrapped`), asset_type, truck_id, trailer_id, position, tread_depth_32nds int, odometer, event_on, work_order_id

### Invoicing
**invoices**: id, organization_id, invoice_number (unique per org), customer_id, load_id, invoice_date, due_date, subtotal_cents, total_cents, status (`draft`/`sent`/`partially_paid`/`paid`/`voided`), is_factored bool, factoring_company, sent_at, voided_at, void_reason
**invoice_lines**: id, organization_id, invoice_id, description, amount_cents
**payments**: id, organization_id, invoice_id, paid_on, amount_cents, method, reference, voided_at, void_reason

### Documents
**documents**: id, organization_id, storage_path, file_name, mime_type, size_bytes, doc_type, expires_on, uploaded_by
**document_links**: id, organization_id, document_id, entity_type (`load`/`truck`/`trailer`/`driver`/`expense`/`work_order`/`invoice`/`company`), entity_id
Storage bucket `documents`, path `{organization_id}/{document_id}/{file_name}`; storage policies check `is_org_member` on the first path segment.

### Alerts & audit
**alerts**: id, organization_id, alert_type, severity (`info`/`warning`/`critical`), entity_type, entity_id, message, due_on, resolved_at — generated by a daily job, deduplicated by (alert_type, entity_id, due_on)
**audit_logs**: id, organization_id, actor_id (no FK, so history survives user deletion), action (`insert`/`update`/`void`/`delete`), table_name, record_id, old_data jsonb, new_data jsonb, created_at — written by triggers; insert-only; readable by owner/admin

### Import
**import_jobs**: id, organization_id, entity, file_name, status (`preview`/`committed`/`failed`), row_count, error_report jsonb

## 4. Reporting views
Implement as SQL views (with `security_invoker = true` so RLS applies):
- `load_financials` — revenue, miles, direct costs, contribution per load
- `truck_period_costs` — function `truck_profitability(org, from, to)` returning revenue, miles, equipment costs, direct costs, allocated overhead, profit, RPM, CPM per truck
- `trailer_period_costs` — function `trailer_costs(org, from, to)` returning miles, maintenance + tire costs, maintenance CPM
- `receivables_aging`

Business formulas must match `PRODUCT_SPEC.md §3`; the TypeScript `calculations.ts` and SQL functions are tested against the same fixture data so they cannot drift.

## 5. Role access matrix (summary)
| Area | owner | admin | dispatcher | maintenance | accounting | viewer |
|---|---|---|---|---|---|---|
| Org settings, users | RW | RW (no billing) | – | – | – | – |
| Customers | RW | RW | RW | R | RW | R |
| Loads, stops | RW | RW | RW | R | R | R |
| Trucks, trailers | RW | RW | R (status RW) | RW | R | R |
| Drivers, pay rules | RW | RW | R (no pay) | R (no pay) | RW | – |
| Expenses | RW | RW | load-level RW | equipment RW | RW | R |
| Maintenance, tires | RW | RW | R | RW | R | R |
| Invoices, payments | RW | RW | R | – | RW | R |
| Reports: company P&L | R | R | – | – | R | R |
| Audit logs | R | R | – | – | – | – |

## 6. Seed data (`supabase/seed.sql`)
Two organizations for isolation tests:
- **Lakeside Freight LLC** — 12 trucks, 18 trailers, 14 drivers, ~6 months of loads, expenses, work orders.
- **Prairie Haul Inc** — 3 trucks, 4 trailers, 3 drivers.
One user per role in Lakeside; one owner in Prairie Haul.

## 7. Migration order
1. `0001_tenancy` — organizations, members, invitations, helper functions, audit trigger function ✅
2. `0002_member_directory` — `list_organization_members(org)`, `get_invitation_preview(token)` ✅
3. `0003_fleet` — trucks, trailers, odometer readings ✅
3b. `0003b_drivers` — drivers, pay rules, `org_today()` ✅
3c. `0003c_customers` — customers, contacts ✅
3d. `0003d_user_deletion` — users who have acted can be deleted (audit keeps their id) ✅
4. `0004_loads` — loads, stops, drivers, accessorials, events, `organization_counters` ✅ (+ `0004b_assign_load`, `0004c_driver_pay`, `0004d_driver_statements`, `0004e_per_mile_deductions` ✅)
4b. `0004b_assign_load` — `assign_load()` for the dispatch board ✅
5. `0005_expenses` — categories, expenses, fuel details, recurring costs
6. `0006_maintenance` — work orders, lines, PM, tires
7. `0007_invoicing` — invoices, lines, payments
8. `0008_documents_alerts` — documents, links, alerts, import jobs, storage policies
9. `0009_reporting` — views and functions
