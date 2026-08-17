

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

  '/login': { public: true },

  '/projects': { roles: ['ADMIN', 'STUDIO'] },
  '/projects/new': { roles: ['ADMIN', 'STUDIO'] },
  '/projects/[id]': { roles: ['ADMIN', 'STUDIO'] },

  '/quote/[token]': { token: true },
  '/contract/[token]': { token: true },
  '/gallery/[token]': { token: true },
}
