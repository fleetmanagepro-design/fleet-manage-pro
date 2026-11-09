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

## Known gaps / follow-ups
- No CI pipeline yet (lint, typecheck, unit, db and e2e tests should run on every PR).
- Production email: verify `fleetmanagepro.com` in Resend (DNS records) and set `RESEND_API_KEY`
  and `EMAIL_FROM` in Vercel. Paste `supabase/templates/*.html` into Supabase → Auth → Email Templates
  and configure Supabase Auth SMTP (Resend SMTP works) so confirmation emails come from the domain too.
- Organization settings screen (edit name, USDOT, address, time zone, overhead allocation) — not built yet.
- A page the user may not open shows "not found" but returns HTTP 200 (pages stream with Cache Components).
  Data is never sent; consider moving role gates into `proxy.ts` later if real status codes matter.

## Next

### Task 3 — Master data (`0003_master_data`)
Customers, trucks, trailers, drivers, driver pay rules, odometer readings: tables + RLS + isolation tests,
list/detail/create/edit screens, role rules from DATABASE_SCHEMA.md §5.

### After that (in order)
4. `0004_loads` — loads, stops, drivers, accessorials, events; load list + detail + dispatch board
5. `0005_expenses` — categories, expenses, fuel, recurring costs
6. `0006_maintenance` — work orders, PM, tires
7. `0007_invoicing` — invoices, payments, aging
8. `0008_documents_alerts` — documents, alerts, CSV import
9. `0009_reporting` — views/functions, dashboard, reports
