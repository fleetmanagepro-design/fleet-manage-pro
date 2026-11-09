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

## Known gaps / follow-ups
- shadcn/ui is not installed yet: `ui.shadcn.com` was unreachable from the build environment. Install at the start of Task 2.
- No CI pipeline yet (lint, typecheck, unit, db and e2e tests should run on every PR).

## Next

### Task 2 — Auth & organization onboarding
- Install shadcn/ui.
- Sign up / sign in / sign out / email verification (Supabase Auth); session refresh in `proxy.ts`.
- Create organization screen (calls `create_organization`), organization switcher.
- Server-side auth helpers: `requireUser`, `requireOrgRole`.
- Invite users (token generation + hashing, email from `@fleetmanagepro.com`), accept-invite page, members list with role changes and removal.
- E2E tests for sign-up → create org → invite → accept.

### After that (in order)
3. `0002_master_data` — customers, trucks, trailers, drivers, pay rules, odometer readings
4. `0003_loads` — loads, stops, drivers, accessorials, events; load list + detail + dispatch board
5. `0004_expenses` — categories, expenses, fuel, recurring costs
6. `0005_maintenance` — work orders, PM, tires
7. `0006_invoicing` — invoices, payments, aging
8. `0007_documents_alerts` — documents, alerts, CSV import
9. `0008_reporting` — views/functions, dashboard, reports
