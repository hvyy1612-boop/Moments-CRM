

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
  '/forgot': { public: true },
  '/reset/[token]': { public: true },

  '/dashboard': { roles: ['ADMIN', 'STUDIO'] },
  '/enquiries': { roles: ['ADMIN', 'STUDIO'] },
  '/enquiries/new': { roles: ['ADMIN', 'STUDIO'] },
  '/projects': { roles: ['ADMIN', 'STUDIO'] },
  '/projects/new': { roles: ['ADMIN', 'STUDIO'] },
  '/projects/[id]': { roles: ['ADMIN', 'STUDIO'] },
  '/clients': { roles: ['ADMIN', 'STUDIO'] },
  '/calendar': { roles: ['ADMIN', 'STUDIO'] },
  '/finance': { roles: ['ADMIN', 'STUDIO'] },
  '/settings': { roles: ['ADMIN', 'STUDIO'] },

  '/activity': { roles: ['ADMIN'] },

  '/quote/[token]': { token: true },
  '/contract/[token]': { token: true },
  '/gallery/[token]': { token: true },
}
