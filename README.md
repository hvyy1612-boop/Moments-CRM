# Moments Photography — Client Management System

A client management system for **Moments Photography & Film**, a Sydney wedding and portrait
studio. It covers the journey from first enquiry through quotation, booking, payment and delivery.


## Stack

Next.js 15 (App Router) · TypeScript (strict) · PostgreSQL · Prisma · Tailwind CSS v4 · Zod ·
Vitest · Playwright. Authentication is implemented directly (no hosted identity provider). Deploys
to Vercel with a Neon Postgres database.

## Project structure


```
moments-cms/
├── README.md                    this file: setup, structure, verification
│
├── prisma/
│   ├── schema.prisma            the full data model: 26 entities, every enum
│   ├── migrations/              versioned SQL, including triggers and partial unique indexes
│   └── seed.ts                  idempotent seed (§13): packages, add-ons, demo records
│
├── scripts/                     the verify gate, one check per file
│   ├── audit-routes.mjs         every route must declare a permission (SEC-A01)
│   ├── check-passwordhash.mjs   no handler may serialise passwordHash (SEC-P03)
│   ├── check-design-tokens.mjs  no colour/spacing/radius literal outside globals.css (§10.1)
│   └── check-money-number.mjs   the number type is banned for money (D6)
│
├── src/
│   ├── app/                     routes: folder path = URL
│   │   ├── (public)/            the website, no sign-in: home, packages, enquire, styleguide
│   │   ├── (staff)/             the studio app, sign-in required   [Slice 2+: login,
│   │   │                        dashboard, enquiries, quotations, bookings, invoices, outbox]
│   │   ├── (client)/            token-link pages, no account       [Slice 3+: quotation
│   │   │                        view/accept, portal, questionnaire]
│   │   ├── api/                 health, auth callbacks, Stripe webhook, cron endpoints
│   │   ├── globals.css          ALL design tokens live here and only here (§10.1)
│   │   └── layout.tsx …         root layout, error and not-found boundaries, favicon
│   │
│   ├── components/              shared UI built at Slice 2+: fields, buttons, status text,
│   │                            the four list/form states (loading, empty, error, populated)
│   │
│   ├── lib/                     everything that is not a route
│   │   ├── auth/                password (Argon2id), sessions, permissions registry, Google
│   │   ├── domain/              business logic, one file per area: enquiry, catalogue,
│   │   │                        quotation, booking, invoice, payment, notification, log
│   │   ├── validation/          Zod schemas, one file per form or endpoint
│   │   ├── email/               EmailAdapter: console (default) and SMTP     [Slice 6]
│   │   ├── db.ts                Prisma singleton; blocks writes to the audit tables
│   │   ├── env.ts               validates environment at boot; refuses to start if broken
│   │   ├── time.ts              Sydney timezone, injectable clock, peak season
│   │   ├── money.ts             AUD formatting; Decimal only
│   │   └── logger.ts            structured JSON logs with correlation ids
│   │
│   └── middleware.ts            security headers + session gate               [Slice 2]
│
└── tests/
    ├── unit/                    Vitest; file and test names carry the BR-xx / SEC-xx they prove
    └── e2e/                     Playwright against a production build; happy + failure paths
```

## Prerequisites

- **Node.js 22** 
- **PostgreSQL 16** via Homebrew 
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
- Scheduled jobs run as Vercel Cron routes;
- Rate limiting is Postgres

