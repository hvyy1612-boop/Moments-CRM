

export type Role = 'ADMIN' | 'STUDIO' | 'EDITOR'

export type RoutePermission =
  | { public: true }
  | { roles: Role[] }
  | { token: true }

export const ROUTE_PERMISSIONS: Record<string, RoutePermission> = {
  '/': { public: true },
  '/api/health': { public: true },
}
