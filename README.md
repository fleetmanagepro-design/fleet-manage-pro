# Fleet Manage Pro

Multi-tenant TMS for US trucking carriers. Read `CLAUDE.md` first; product and data
model live in `docs/`.

## Local setup

Requirements: Node 22+, Docker.

```bash
npm install
npx supabase start          # local Postgres, Auth, REST (Docker)
npx supabase status         # copy API URL and publishable key
```

Create `.env.local` (never committed):

```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable key from `supabase status`>
```

```bash
npm run db:reset            # apply migrations + seed
npm run dev                 # http://localhost:3000
```

Seed users (password `Password123!`): `owner@`, `admin@`, `dispatch@`, `shop@`,
`accounting@`, `viewer@lakesidefreight.test`, and `owner@prairiehaul.test`.

## Checks (all must pass before a task is done)

```bash
npm run lint
npm run typecheck
npm run test        # unit (Vitest)
npm run test:db     # database + RLS (pgTAP)
npm run test:e2e    # end-to-end (Playwright)
```

After changing the schema, regenerate types with `npm run db:types`.
