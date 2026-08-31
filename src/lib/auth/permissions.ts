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
  '/api/calendar/feed': { token: true },
  // Staff entrance and account recovery: public by necessity (not signed in yet / token-authorised).
  '/login': { public: true },
  '/register': { public: true },
  '/forgot': { public: true },
  '/reset/[token]': { public: true },
  // Staff workspace: the dashboard, enquiries, projects, and the project detail.
  '/dashboard': { roles: ['ADMIN', 'STUDIO'] },
  '/enquiries': { roles: ['ADMIN', 'STUDIO'] },
  '/enquiries/[id]': { roles: ['ADMIN', 'STUDIO'] },
  '/jobs': { roles: ['ADMIN', 'STUDIO'] },
  '/jobs/[id]': { roles: ['ADMIN', 'STUDIO'] },
  '/clients': { roles: ['ADMIN', 'STUDIO'] },
  '/clients/new': { roles: ['ADMIN', 'STUDIO'] },
  '/clients/[id]': { roles: ['ADMIN', 'STUDIO'] },
  '/clients/[id]/edit': { roles: ['ADMIN', 'STUDIO'] },
  '/calendar': { roles: ['ADMIN', 'STUDIO'] },
  '/finance': { roles: ['ADMIN', 'STUDIO'] },
  '/settings': { roles: ['ADMIN', 'STUDIO'] },
  '/users': { roles: ['ADMIN'] },
  // Security + activity log: ADMIN only (contains IP addresses and login history).
  '/activity': { roles: ['ADMIN'] },
  // Client-facing, reached by a token only. No session, no account.
  '/quote/[token]': { token: true },
  '/contract/[token]': { token: true },
  '/gallery/[token]': { token: true },
}
