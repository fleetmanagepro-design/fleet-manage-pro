# Roadmap

Status of the MVP build. Updated at the end of every task.

## Done

### Task 1 — Project foundation + tenancy (11/09/2026)
- Next.js 16 (App Router, TypeScript strict), Tailwind 4, ESLint, Zod, Vitest, Playwright, Supabase CLI.
- Migration `0001_tenancy`: `organizations`, `organization_members`, `invitations`, `audit_logs`;
  `is_org_member` / `has_org_role`; generic `audit_trigger` and `set_updated_at`;
  last-owner guard; RPCs `create_organization` and `accept_invitation`; RLS + column grants.
- 53 pgTAP tests (`npm run test:db`): cross-org isolation in both directions, anon access,
  role rules, last-owner rule, immediate access revocation, invitation flow, audit log immutability.
- `src/lib/money.ts` (cents parsing/formatting/summing) with 43 unit tests.
- Supabase server/browser clients (user session only, no service-role client) and env validation.
- Seed: Lakeside Freight LLC (one user per role) and Prairie Haul Inc (owner). Password: `Password123!`.

### Task 2 — Auth & organization onboarding (11/09/2026)
- shadcn/ui (base-nova style) with the components in `src/components/ui/`.
- Sign up (email verification required), sign in, sign out, forgot/reset password.
  Auth emails use the token-hash flow via `/auth/confirm`; templates in `supabase/templates/`.
- `src/proxy.ts` refreshes the session and sends signed-out users to `/sign-in?next=…`.
- Onboarding: create organization (calls `create_organization`); organization switcher for multi-org users.
- `src/lib/auth.ts`: `getSessionContext`, `requireUser`, `requireOrg`, `requireOrgRole`, `authorizeAction`.
  Active organization is a cookie, re-validated against memberships on every request.
- Members page (owner/admin): invite by email + role, pending invitations with revoke,
  change role, remove member, leave organization. Accept-invitation page `/invite/[token]`.
- Invitation email via Resend (REST API, no SDK). Local dev and e2e use Mailpit from `supabase start`.
  If sending fails, the owner/admin sees the one-time invite link to share manually.
- Migration `0002_member_directory`: `list_organization_members`, `get_invitation_preview` (+10 pgTAP tests).
- 78 unit tests, 63 database tests, 5 end-to-end tests (full sign-up → org → invite → join flow,
  redirect after sign-in, wrong password, role-based menu, password reset).

### Task 3a — Trucks & trailers (11/09/2026)
- Migration `0003_fleet`: `trucks`, `trailers`, `odometer_readings` with RLS per role matrix,
  composite FKs against cross-tenant references, audit triggers, meter-reading triggers
  (readings only go up; corrections owner/admin with reason), sold = read-only, archive instead of delete.
- Screens: trucks and trailers lists (status filter, show archived, compliance badge), add/edit forms,
  detail pages with Overview (details, compliance, status, meter readings + history) and
  honest "not built yet" tabs for Loads / Expenses / Maintenance / Documents.
- Seed: Lakeside 12 trucks / 18 trailers, Prairie Haul 3 / 4, with reading history and expiring dates.
- Tests: 53 new pgTAP tests (116 total), 42 new unit tests (120 total), 5 new e2e tests (10 total).
- Spec: fleet business rules added to PRODUCT_SPEC.md §4.5.

### Task 3b — Drivers & pay rules (11/09/2026)
- Migration `0003b_drivers`: `drivers`, `driver_pay_rules`, `org_today()`. RLS: owner/admin/accounting edit;
  dispatcher/maintenance read drivers but not pay; viewers see no drivers. Pay rules in effect are immutable.
- Screens: drivers list (status filter, CDL/medical expiry, compliance), add/edit, detail with compliance
  (60/30-day warnings, "can't be dispatched" when expired) and pay history with current/upcoming rules.
  Truck page lists its drivers.
- Shared `src/lib/expiry.ts` for expiry warnings (fleet now uses it too).
- Tests: 37 new pgTAP (155 total), 22 new unit (146 total), 4 new e2e (14 total).

### Task 3c — Customers (11/09/2026)
- Migration `0003c_customers`: `customers`, `customer_contacts` with RLS (owner/admin/dispatcher/accounting edit,
  everyone reads), composite FK, audit, MC unique per org, do-not-use requires a reason, archive only.
- Screens: customer list (search by name or MC, type/status filters, show archived), add/edit, detail with
  contacts (add/remove) and "not built yet" cards for loads and invoices.
- Fixed a form bug found by the e2e test: after a failed submit, dropdowns snapped back to their first
  value (React applies a select's defaultValue only on mount). `NativeSelect` now remounts when its default changes.
- Tests: 22 new pgTAP (177 total), 12 new unit (158 total), 2 new e2e (16 total).

### Online (11/09–11/10/2026)
- Production at https://app.fleetmanagepro.com on Vercel + Supabase (East US); see `docs/DEPLOYMENT.md`.
- CI on every PR; migrations deploy to production from `main` via GitHub Actions; seed never runs in production.
- Email through Resend from `@fleetmanagepro.com`: invitations (app) and sign-up / password reset (Supabase SMTP).
- `0003d_user_deletion`: users who have used the app can be deleted (found in production).

### Task 4a — Loads (11/10/2026)
- Migration `0004_loads`: loads, stops (with local time zone), load drivers (team of two), accessorials, insert-only
  status history; automatic load numbers; `save_load()` (atomic) and `change_load_status()` (rules + history).
- Screens: load list with filters, new/edit load (stops add/remove/reorder, truck suggests its driver, expired drivers
  disabled, overlap warning with owner/admin override), load detail with status changes, accessorials, profitability
  (revenue, miles, RPM, empty %), assignment and history.
- Tests: 44 new pgTAP (230 total), 26 new unit (184 total), 4 new e2e (20 total), including the spec's
  "2-stop load in under a minute".

### Task 4b — Dispatch board (11/10/2026)
- `/dispatch`: trucks × 7 days (company time zone), loads as blocks spanning their days, overlapping loads stacked,
  in-shop / out-of-service trucks marked, previous/next week; unassigned open loads with an assign form
  (truck suggests its driver, expired drivers disabled, same overlap rule and override).
- Migration `0004b_assign_load`: `assign_load()` (runs as the caller; assignment rules apply).
- Tests: 9 new pgTAP (239 total), 7 new unit (191 total), 3 new e2e (23 total).

### Task 4c-1 — Driver pay per load (11/10/2026)
- Pay rules match how carriers pay: owner-operators keep a % of the load value (company fee per driver, default 12%),
  company drivers get a rate per mile. Rule in effect on the first pickup day applies.
- Migration `0004c_driver_pay`: on-time bonus / late penalty accessorials (penalties reduce load value),
  `load_driver_items` (extras paid in full), `driver_deductions` (free-form % of gross or $/week, ended not deleted).
- Load page: load value, driver pay per driver (value − company fee + extras, or miles × rate) and contribution
  (owner/admin/accounting only); driver extras section. Driver page: deductions section.
- Tests: 14 new pgTAP (253 total), 8 new unit (199 total), 4 new e2e (27 total).

### Task 4c-2 — Weekly driver statements (11/11/2026)
- `/statements` ("Driver pay"): every driver with loads, deductions or a balance for the week (Mon–Sun, by pickup week),
  gross, net, status; previous/next week. Defaults to last week.
- Statement page per driver and week: loads (value, company fee, driver share — or miles × rate), extras, deductions
  (% of gross before the fee, or fixed weekly), balance carried in, net pay. Finalize (immutable snapshot), void with reason,
  Print / Save as PDF. Links from the load page and the driver page (list of finalized/voided statements).
- Migration `0004d_driver_statements`: statements + lines, written only through `finalize_driver_statement()` /
  `void_driver_statement()` which check role, week order, carried balance, delivered loads, one statement per load, totals.
- Migration `0004e_per_mile_deductions`: truck/trailer rent by agreement — optional weekly amount + rate per mile over
  free miles per week (loaded + empty miles, starting over each week).
- Tests: 46 new pgTAP (299 total), 20 new unit (219 total), 4 new e2e (31 total).

### Stops: ZIP lookup + remembered facilities (11/11/2026)
- **ZIP lookup.** Migration `0004f_us_zip_codes`: 41,689 US ZIP codes with city, state and time zone, with corrected
  Kentucky/Indiana zones (`docs/THIRD_PARTY_DATA.md`). Typing a stop's ZIP fills city, state and zone; in two-zone states
  the form asks to check the zone.
- **Remembered facilities.** Migration `0004g_facilities`: every saved stop with a facility name is remembered per
  organization. The facility field suggests matches (most used first) and picking one fills the whole stop.
- **Fixed: stop street addresses were never saved.** The form parser dropped field names containing a digit (`addressLine1`)
  since Task 4a. Loads saved before this fix have no street address on their stops.
- **Tests:** 26 new pgTAP (325 total), 9 new unit (228 total), 2 new e2e (33 total).

### Loads: no fuel surcharge (11/12/2026)
- The load form has only Linehaul; the fuel surcharge field and row are gone. Loads saved from now on store 0. The owner
  chose not to touch older loads.

### Loads: pickup number; automatic load numbers only (11/12/2026)
- Pickup stops have a **Pickup #** field, shown on the load page.
- **Load #** is no longer on the form. Every new load gets the next number, and the database refuses to change one
  (migration `0004h_pickup_number_auto_load_number`).

### Driver equipment (11/12/2026)
- Drivers have a **default trailer** next to the default truck (migration `0004i_driver_default_trailer`; driver
  form and driver page).
- On the load form and the dispatch board's assign form, **picking the driver fills their truck and trailer**; picking
  a truck still suggests its driver. Equipment chosen by hand is kept.
- On the load form, Assignment moved above Stops.

## Open questions for the owner (asked 11/11/2026, answer pending)
1. **Team loads (two owner-operators on one load):** how is the load value split between them, e.g. 50/50 before the
   company fee, or another split? Today each driver is paid on their own rule from the full load value (2 × 88%).
2. **TONU (truck ordered, not used):** when the broker pays TONU on a cancelled load, does the driver get part of it,
   and how much? Today TONU loads are not paid to drivers.

The owner will go back through the app from the start to correct and add things; answer these on the way.

## Known gaps / follow-ups
- Dispatch board: no drag-and-drop; loads without appointment times don't appear on it (they're in the list).
- Loads: Invoiced/Paid can't be set until invoicing exists; contribution counts driver pay only until expenses exist (Task 5);
  no document upload; actual arrival/departure times are stored but not editable in the UI yet.
- Driver pay: a team load pays each driver on their own rule from the full load value (two owner-operators would each get
  88%) — confirm how team loads split with the owner. Editing a load after its statement is finalized doesn't change the
  statement (void and finalize again); a warning on the load page would help. TONU (cancelled but paid) loads aren't paid to drivers yet.
- Facilities: no screen yet to edit, merge or archive remembered facilities (the database already allows it).
- Customer contacts can be added and removed but not edited in place.
- No in-app "Delete organization" (owner only, with confirmation and data export) — needed once; done by SQL.
- Marketing site at `fleetmanagepro.com` not built; the root domain is parked at GoDaddy.
- Organization settings screen (edit name, USDOT, address, time zone, overhead allocation) — not built yet.
- A page the user may not open shows "not found" but returns HTTP 200 (pages stream with Cache Components).
  Data is never sent; consider moving role gates into `proxy.ts` later if real status codes matter.
- Next 16 keeps recently visited pages mounted but hidden; form field ids repeat across them.
  Labels still work in tests, but switch `FormField` to `useId`-based ids if it ever causes trouble.
- Compliance expirations are shown on assets; the alert center and daily email digest come with Task 8.

## Next

### Task 5 — Expenses (`0005_expenses`)
Categories, expenses (load-direct, equipment, overhead), fuel, recurring costs; void instead of delete; contribution on the
load page then includes load-direct expenses.

### After that (in order)
6. `0006_maintenance` — work orders, PM, tires
7. `0007_invoicing` — invoices, payments, aging
8. `0008_documents_alerts` — documents, alerts, CSV import
9. `0009_reporting` — views/functions, dashboard, reports
