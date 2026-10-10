/**
 * Authorisation registry (SEC-A01). Deny by default: every route file under src/app must declare its
 * permission here, or scripts/audit-routes.mjs fails the build. Slice 1 surface only; later slices
 * add their routes here as they land.
 */

// Roles that can log in. Clients have no login and reach their records by token (`token`).
export type Role = 'ADMIN' | 'STUDIO' | 'SUPERVISOR'

export type RoutePermission =
  | { public: true }
  | { roles: Role[] }
  | { token: true }
  | { secret: true }

export const ROUTE_PERMISSIONS: Record<string, RoutePermission> = {
  '/': { public: true },
  '/enquire': { public: true },
  '/api/health': { public: true },
  // Vercel Cron endpoint: guarded by CRON_SECRET inside the route, not by a session.
  '/api/cron/daily': { secret: true },
  // Resend delivery webhook: guarded by the Svix signature (RESEND_WEBHOOK_SECRET) inside the route.
  '/api/webhooks/resend': { secret: true },
  '/api/calendar/feed': { token: true },
  // Staff entrance, sign-up and account recovery: public by necessity (not signed in yet). Sign-up can be
  // switched off by an Admin (Users page) and never offers the Admin role once an Admin exists.
  '/login': { public: true },
  '/register': { public: true },
  '/forgot': { public: true },
  '/reset/[token]': { public: true },
  // Forced first-login password change: any signed-in staff member, before any role-gated area.
  '/change-password': { roles: ['ADMIN', 'STUDIO', 'SUPERVISOR'] },
  // Staff workspace: the dashboard, leads (DB Enquiry), jobs (DB Project) and their detail pages.
  // SUPERVISOR (read-only) may open every viewing page; pages that exist only to create or edit
  // (new quote, quote/invoice/client edit, new invoice, client import) stay ADMIN / STUDIO.
  '/dashboard': { roles: ['ADMIN', 'STUDIO', 'SUPERVISOR'] },
  '/notifications': { roles: ['ADMIN', 'STUDIO', 'SUPERVISOR'] },
  '/leads': { roles: ['ADMIN', 'STUDIO', 'SUPERVISOR'] },
  '/leads/report': { roles: ['ADMIN', 'STUDIO', 'SUPERVISOR'] },
  '/leads/[id]': { roles: ['ADMIN', 'STUDIO', 'SUPERVISOR'] },
  '/jobs': { roles: ['ADMIN', 'STUDIO', 'SUPERVISOR'] },
  '/jobs/report': { roles: ['ADMIN', 'STUDIO', 'SUPERVISOR'] },
  '/jobs/[id]': { roles: ['ADMIN', 'STUDIO', 'SUPERVISOR'] },
  // Enquiry-stage quotes (docs/31): the Quotes record list, create flow, and detail/builder.
  '/quotes': { roles: ['ADMIN', 'STUDIO', 'SUPERVISOR'] },
  '/quotes/new': { roles: ['ADMIN', 'STUDIO'] },
  '/quotes/[id]': { roles: ['ADMIN', 'STUDIO', 'SUPERVISOR'] },
  '/quotes/[id]/edit': { roles: ['ADMIN', 'STUDIO'] },
  '/quotes/[id]/preview': { roles: ['ADMIN', 'STUDIO', 'SUPERVISOR'] },
  '/finance/new': { roles: ['ADMIN', 'STUDIO'] },
  '/finance/report': { roles: ['ADMIN', 'STUDIO', 'SUPERVISOR'] },
  '/finance/[invoiceId]': { roles: ['ADMIN', 'STUDIO', 'SUPERVISOR'] },
  '/finance/[invoiceId]/edit': { roles: ['ADMIN', 'STUDIO'] },
  '/clients': { roles: ['ADMIN', 'STUDIO', 'SUPERVISOR'] },
  '/clients/import': { roles: ['ADMIN', 'STUDIO'] },
  '/clients/export': { roles: ['ADMIN', 'STUDIO', 'SUPERVISOR'] },
  '/clients/[id]': { roles: ['ADMIN', 'STUDIO', 'SUPERVISOR'] },
  '/clients/[id]/edit': { roles: ['ADMIN', 'STUDIO'] },
  '/calendar': { roles: ['ADMIN', 'STUDIO', 'SUPERVISOR'] },
  '/finance': { roles: ['ADMIN', 'STUDIO', 'SUPERVISOR'] },
  // Interactive price calculator: build a quote estimate from the fixed-price catalogue.
  '/pricing': { roles: ['ADMIN', 'STUDIO', 'SUPERVISOR'] },
  // Owner decision: a studio Staff member does everything the owner does EXCEPT read the Activity log,
  // so company settings, notification go-live and account management are open to ADMIN and STUDIO.
  '/settings': { roles: ['ADMIN', 'STUDIO'] },
  // Notification automation go-live control (docs/25 Part 4): switch client emails / follow-ups on.
  '/settings/notifications': { roles: ['ADMIN', 'STUDIO'] },
  '/users': { roles: ['ADMIN', 'STUDIO'] },
  // Printable staff roster (per team) — the source for the "Download PDF" export.
  '/users/roster/[team]': { roles: ['ADMIN', 'STUDIO'] },
  // Security + activity log: ADMIN only (contains IP addresses and login history) — the ONE area Staff
  // cannot reach. This is the single difference between the Admin owner and Staff.
  '/activity': { roles: ['ADMIN'] },
  // Client-facing, reached by a token only. No session, no account.
  '/quote/[token]': { token: true },
  '/contract/[token]': { token: true },
  '/invoice/[token]': { token: true },
}
