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
  // Staff entrance and account recovery: public by necessity (not signed in yet / token-authorised).
  '/login': { public: true },
  // Staff workspace (Slice 1): projects and the quote builder inside a project.
  '/projects': { roles: ['ADMIN', 'STUDIO'] },
  '/projects/[id]': { roles: ['ADMIN', 'STUDIO'] },
  // Client-facing, reached by a token only. No session, no account.
  '/quote/[token]': { token: true },
  '/contract/[token]': { token: true },
  '/gallery/[token]': { token: true },
}
