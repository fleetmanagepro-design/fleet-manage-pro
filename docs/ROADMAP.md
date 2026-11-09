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

## Known gaps / follow-ups
- Customer contacts can be added and removed but not edited in place.
- No CI pipeline yet (lint, typecheck, unit, db and e2e tests should run on every PR).
- Production email: verify `fleetmanagepro.com` in Resend (DNS records) and set `RESEND_API_KEY`
  and `EMAIL_FROM` in Vercel. Paste `supabase/templates/*.html` into Supabase → Auth → Email Templates
  and configure Supabase Auth SMTP (Resend SMTP works) so confirmation emails come from the domain too.
- Organization settings screen (edit name, USDOT, address, time zone, overhead allocation) — not built yet.
- A page the user may not open shows "not found" but returns HTTP 200 (pages stream with Cache Components).
  Data is never sent; consider moving role gates into `proxy.ts` later if real status codes matter.
- Next 16 keeps recently visited pages mounted but hidden; form field ids repeat across them.
  Labels still work in tests, but switch `FormField` to `useId`-based ids if it ever causes trouble.
- Compliance expirations are shown on assets; the alert center and daily email digest come with Task 8.

## Next

### Next up — Put the app online (before Task 4)
Supabase cloud project + Vercel deployment at `app.fleetmanagepro.com`, environment variables,
auth email templates, Resend domain. Needs the owner's Supabase, Vercel and DNS accounts.

### After that (in order)
4. `0004_loads` — loads, stops, drivers, accessorials, events; load list + detail + dispatch board
5. `0005_expenses` — categories, expenses, fuel, recurring costs
6. `0006_maintenance` — work orders, PM, tires
7. `0007_invoicing` — invoices, payments, aging
8. `0008_documents_alerts` — documents, alerts, CSV import
9. `0009_reporting` — views/functions, dashboard, reports
