/**
 * Authorisation registry (SEC-A01). Deny by default: every route file under src/app must declare its
 * permission here, or scripts/audit-routes.mjs fails the build. Slice 1 surface only; later slices
 * add their routes here as they land.
 */

// Roles that can log in. Clients have no login and reach their records by token (`token`).
export type Role = 'ADMIN' | 'STUDIO' | 'EDITOR'

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
  // Google staff sign-in OAuth: reached before a session exists; guarded internally by OAuth state.
  '/api/auth/google': { public: true },
  '/api/auth/google/callback': { public: true },
  // Staff entrance and account recovery: public by necessity (not signed in yet / token-authorised).
  // Accounts are admin-provisioned, so there is no public /register.
  '/login': { public: true },
  '/forgot': { public: true },
  '/reset/[token]': { public: true },
  // Forced first-login password change: any signed-in staff member, before any role-gated area.
  '/change-password': { roles: ['ADMIN', 'STUDIO', 'EDITOR'] },
  // Staff workspace: the dashboard, enquiries, projects, and the project detail.
  '/dashboard': { roles: ['ADMIN', 'STUDIO'] },
  '/enquiries': { roles: ['ADMIN', 'STUDIO'] },
  '/enquiries/[id]': { roles: ['ADMIN', 'STUDIO'] },
  '/jobs': { roles: ['ADMIN', 'STUDIO'] },
  '/jobs/[id]': { roles: ['ADMIN', 'STUDIO'] },
  // Enquiry-stage quotes (docs/31): the Quotes record list, create flow, and detail/builder.
  '/quotes': { roles: ['ADMIN', 'STUDIO'] },
  '/quotes/new': { roles: ['ADMIN', 'STUDIO'] },
  '/quotes/[id]': { roles: ['ADMIN', 'STUDIO'] },
  '/quotes/[id]/edit': { roles: ['ADMIN', 'STUDIO'] },
  '/jobs/[id]/invoice/[invoiceId]': { roles: ['ADMIN', 'STUDIO'] },
  '/finance/new': { roles: ['ADMIN', 'STUDIO'] },
  '/finance/[invoiceId]': { roles: ['ADMIN', 'STUDIO'] },
  '/clients': { roles: ['ADMIN', 'STUDIO'] },
  '/clients/new': { roles: ['ADMIN', 'STUDIO'] },
  '/clients/import': { roles: ['ADMIN', 'STUDIO'] },
  '/clients/export': { roles: ['ADMIN', 'STUDIO'] },
  '/clients/[id]': { roles: ['ADMIN', 'STUDIO'] },
  '/clients/[id]/edit': { roles: ['ADMIN', 'STUDIO'] },
  '/calendar': { roles: ['ADMIN', 'STUDIO'] },
  '/finance': { roles: ['ADMIN', 'STUDIO'] },
  // Interactive price calculator: build a quote estimate from the fixed-price catalogue.
  '/pricing': { roles: ['ADMIN', 'STUDIO'] },
  // Company configuration is owner-level, not a day-to-day staff workflow.
  '/settings': { roles: ['ADMIN'] },
  // Notification automation go-live control (docs/25 Part 4): switch client emails / follow-ups on.
  '/settings/notifications': { roles: ['ADMIN'] },
  '/users': { roles: ['ADMIN'] },
  // Printable staff roster (per team) — the source for the "Download PDF" export.
  '/users/roster/[team]': { roles: ['ADMIN'] },
  // Security + activity log: ADMIN only (contains IP addresses and login history).
  '/activity': { roles: ['ADMIN'] },
  // Client-facing, reached by a token only. No session, no account.
  '/quote/[token]': { token: true },
  '/contract/[token]': { token: true },
  '/gallery/[token]': { token: true },
  '/invoice/[token]': { token: true },
  '/questionnaire/[token]': { token: true },
  '/portal/[token]': { token: true },
}
