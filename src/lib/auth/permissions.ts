

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
  '/enquiries/[id]/quote': { roles: ['ADMIN', 'STUDIO'] },
  '/quotations/[id]': { roles: ['ADMIN', 'STUDIO'] },
  '/bookings': { roles: ['ADMIN', 'STUDIO'] },
  '/bookings/[id]': { roles: ['ADMIN', 'STUDIO'] },

  '/invoices': { roles: ['ADMIN', 'STUDIO'] },
  '/invoices/[id]': { roles: ['ADMIN', 'STUDIO'] },

  '/outbox': { roles: ['ADMIN', 'STUDIO', 'EDITOR'] },

  '/deliverables': { roles: ['ADMIN', 'STUDIO', 'EDITOR'] },

  '/quote/[token]': { token: true },
  '/portal/[token]': { token: true },
}
