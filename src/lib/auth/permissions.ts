/**
 * Authorisation registry (§5, SEC-A01).
 *
 * Deny by default: every route file under src/app must declare its permission here. A route with
 * no declaration is a BUILD FAILURE, never an implicit allow — scripts/audit-routes.mjs (§12.6)
 * enforces this. The enforcing wrapper that every handler calls is built in Slice 1/2; Phase 0
 * establishes the declaration surface and the audit.
 */

// Roles that can log in. CLIENT is deliberately absent: clients have no login and reach their own
// records only through tokens (§5), so client-token routes are marked `token`, not a role.
export type Role = 'ADMIN' | 'STUDIO' | 'EDITOR'

export type RoutePermission =
  | { public: true }
  | { roles: Role[] }
  | { token: true }

/**
 * The single declaration surface. Keys are route ids (URL paths); dynamic segments use the
 * Next.js bracket form, e.g. '/quotation/[token]'.
 */
export const ROUTE_PERMISSIONS: Record<string, RoutePermission> = {
  '/': { public: true },
  '/packages': { public: true },
  '/packages/[code]': { public: true },
  '/styleguide': { public: true },
  '/api/health': { public: true },
}
