

export type Role = 'ADMIN' | 'STUDIO' | 'EDITOR'

export type RoutePermission =
  | { public: true }
  | { roles: Role[] }
  | { token: true }

export const ROUTE_PERMISSIONS: Record<string, RoutePermission> = {
  '/': { public: true },
  '/packages': { public: true },
  '/packages/[code]': { public: true },
  '/enquire': { public: true },
  '/styleguide': { public: true },
  '/api/health': { public: true },
}
