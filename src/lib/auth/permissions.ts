

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

  '/login': { public: true },
  '/forgot-password': { public: true },
  '/reset-password/[token]': { public: true },

  '/dashboard': { roles: ['ADMIN', 'STUDIO', 'EDITOR'] },

  '/enquiries': { roles: ['ADMIN', 'STUDIO'] },
  '/enquiries/[id]': { roles: ['ADMIN', 'STUDIO'] },
}
