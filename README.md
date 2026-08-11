# Moments Photography — Client Management System

A client management system for **Moments Photography & Film**, a Sydney wedding and portrait
studio. It covers the journey from first enquiry through quotation, booking, payment and delivery.

Built for a Master of ICT capstone.

## Stack

Next.js 15 (App Router) · TypeScript (strict) · PostgreSQL · Prisma · Tailwind CSS v4 · Zod ·
Vitest · Playwright. Authentication is implemented directly (no hosted identity provider). Deploys
to Vercel with a Neon Postgres database.

## Prerequisites

- **Node.js 22** (`.nvmrc` pins it; Node 20+ works). Run `nvm use` if you use nvm.
- **PostgreSQL 16** via Homebrew (this project uses Homebrew rather than Docker):

  ```bash
  brew install postgresql@16
  brew services start postgresql@16
  ```

## Setup

```bash
# 1. Create the database (the default superuser is your macOS username)
/opt/homebrew/opt/postgresql@16/bin/createdb moments_cms

# 2. Configure environment
cp .env.example .env
#    then edit .env and set your macOS username in the connection strings

# 3. Install dependencies
npm install

# 4. Sync the schema and generate the Prisma client
npx prisma db push

# 5. Run the app
npm run dev            # http://localhost:3000
```

Health check: `curl http://localhost:3000/api/health` → `{"status":"ok","database":"up"}`.

## Verification

The single quality gate. It needs Postgres running and Playwright's browser installed once
(`npx playwright install chromium`):

```bash
npm run verify
```

It runs, in order: `tsc --noEmit` (strict) → ESLint (zero warnings) → Vitest → route-permission
audit → `passwordHash` grep → design-token grep → money-as-`number` grep → Playwright e2e →
`npm audit --audit-level=high`.

| Script | Purpose |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js dev / production build / serve |
| `npm run typecheck` | `tsc --noEmit`, strict, no `any` |
| `npm run lint` | ESLint, zero warnings |
| `npm run test` | Vitest unit tests |
| `npm run e2e` | Playwright end-to-end |
| `npm run check:routes` | fail if any route lacks a permission declaration (§12.6) |
| `npm run check:passwordhash` | fail if a handler can serialise `passwordHash` (§12.7) |
| `npm run check:tokens` | fail if a colour/spacing/radius literal is outside `globals.css` (§12.8) |
| `npm run check:money` | fail if the `number` type is used for money (§12.9) |

## Deployment (Vercel + Neon)

- Create a Neon Postgres database. Set `DATABASE_URL` to the **pooled** connection string and
  `DIRECT_URL` to the **direct** one (used for migrations).
- Configure the same environment variables in Vercel. `env.ts` refuses to boot if any required
  variable is missing (SEC-A08).
- Scheduled jobs run as Vercel Cron routes; rate limiting is Postgres-backed (D-004, D-005).
