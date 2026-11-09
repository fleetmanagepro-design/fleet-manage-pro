# CLAUDE.md — Fleet Manage Pro

Read this file at the start of every session. It is the source of truth for how we build.

## What we are building

Fleet Manage Pro is a multi-tenant web SaaS TMS for US trucking carriers (initial target: 5–50 trucks).
Core promise: **the owner sees, per load, truck, trailer and driver, where the company makes and loses money** — with maintenance costs (especially trailers and tires) tracked properly.

Domain: **fleetmanagepro.com** (production app at `app.fleetmanagepro.com`, marketing site at `fleetmanagepro.com`).
Transactional email (invites, alerts) is sent from `@fleetmanagepro.com`.

Full product details: `docs/PRODUCT_SPEC.md`
Data model: `docs/DATABASE_SCHEMA.md`

## Tech stack

- Next.js (App Router) + TypeScript (strict mode)
- Tailwind CSS + shadcn/ui
- Supabase: PostgreSQL, Auth, Storage, Row Level Security
- Zod for all input validation
- Vitest for unit tests, Playwright for end-to-end tests
- Hosting: Vercel. Payments (later): Stripe. Maps (later): Mapbox.

Do not add new dependencies without saying why and asking first.

## Commands

- `npm run dev` — start local dev server
- `npm run lint` / `npm run typecheck` — must pass before any task is considered done
- `npm run test` — unit tests
- `npm run test:db` — database tests (pgTAP, `supabase/tests/database/`), incl. RLS isolation tests
- `npm run test:e2e` — Playwright tests
- `npx supabase migration new <name>` — create a migration
- `npx supabase db reset` — rebuild local DB from migrations + seed

## Project structure

```
src/
  app/                 # routes and pages only, thin
  components/ui/       # shadcn primitives
  components/          # shared components
  modules/<module>/    # dispatch, fleet, drivers, maintenance, finance, documents, analytics
    actions.ts         # server actions (mutations)
    queries.ts         # server-side reads
    schemas.ts         # Zod schemas
    calculations.ts    # pure business logic, fully unit-tested
    components/        # module-specific UI
  lib/                 # supabase clients, auth helpers, money/miles utils
supabase/migrations/   # SQL migrations — the ONLY way to change the schema
supabase/seed.sql      # realistic demo data (2 organizations)
tests/
docs/
```

## Non-negotiable rules

### Multi-tenancy & security
1. Every business table has `organization_id uuid not null` and RLS enabled. No exceptions.
2. RLS is the primary guard; server code also checks membership and role. Never rely on the frontend.
3. Never use the Supabase service-role key in code that handles a user request. Service role is only for migrations, seed and background jobs.
4. Every new table ships with RLS policies **and** a test proving a user from Org A cannot read or write Org B's rows.
5. Secrets live in environment variables only. Never commit `.env*` files.

### Money and numbers
6. Money is stored as integer **cents** (`bigint`). Never floats. Use helpers in `src/lib/money.ts`.
7. Miles are `numeric(10,1)`. Rates per mile are computed, never stored as truth.
8. All financial calculations live in `modules/*/calculations.ts` as pure functions with unit tests, including edge cases (zero miles, no revenue, negative profit).

### Data integrity
9. Schema changes only through a new migration file. Never edit a migration that has been applied.
10. Financial records (expenses, invoices, payments, driver pay) are never hard-deleted — use `voided_at` + reason. Every change is written to `audit_logs`.
11. Load status changes are recorded in `load_events`.

### Code quality
12. Business logic does not live in React components.
13. Validate all input with Zod on the server.
14. No mock data standing in for unfinished features. If it isn't done, say it isn't done.
15. Handle and log errors; show the user a clear message.

## How we work

- **Plan first.** For any task bigger than a small fix: propose a short plan (files to touch, migrations, tests) and wait for approval.
- **Small steps.** One feature or sub-feature per task. Each task ends with lint, typecheck and tests passing.
- **Acceptance criteria** for each feature come from `docs/PRODUCT_SPEC.md`. A task is done only when they pass.
- **Ask, don't guess** on business rules that the spec doesn't cover. Add the answer to the spec afterward.
- After finishing a task, update `docs/ROADMAP.md` (what is done, what is next).

## Language

- Code, comments, database, UI text: **English** (US market).
- US units and formats: miles, gallons, USD, MM/DD/YYYY, US states.
- The project owner may write in Serbian — answer in Serbian, but keep code and UI in English.
