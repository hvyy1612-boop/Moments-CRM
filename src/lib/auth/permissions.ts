

export type Role = 'ADMIN' | 'STUDIO' | 'SUPERVISOR'

export type RoutePermission =
  | { public: true }
  | { roles: Role[] }
  | { token: true }
  | { secret: true }

export const ROUTE_PERMISSIONS: Record<string, RoutePermission> = {
  '/': { public: true },
  '/enquire': { public: true },
  '/api/health': { public: true },

  '/api/cron/daily': { secret: true },

  '/api/webhooks/resend': { secret: true },
  '/api/calendar/feed': { token: true },

  '/login': { public: true },
  '/register': { public: true },
  '/forgot': { public: true },
  '/reset/[token]': { public: true },

  '/change-password': { roles: ['ADMIN', 'STUDIO', 'SUPERVISOR'] },

  '/dashboard': { roles: ['ADMIN', 'STUDIO', 'SUPERVISOR'] },
  '/notifications': { roles: ['ADMIN', 'STUDIO', 'SUPERVISOR'] },
  '/leads': { roles: ['ADMIN', 'STUDIO', 'SUPERVISOR'] },
  '/leads/report': { roles: ['ADMIN', 'STUDIO', 'SUPERVISOR'] },
  '/leads/[id]': { roles: ['ADMIN', 'STUDIO', 'SUPERVISOR'] },
  '/jobs': { roles: ['ADMIN', 'STUDIO', 'SUPERVISOR'] },
  '/jobs/report': { roles: ['ADMIN', 'STUDIO', 'SUPERVISOR'] },
  '/jobs/[id]': { roles: ['ADMIN', 'STUDIO', 'SUPERVISOR'] },

  '/quotes': { roles: ['ADMIN', 'STUDIO', 'SUPERVISOR'] },
  '/quotes/new': { roles: ['ADMIN', 'STUDIO'] },
  '/quotes/[id]': { roles: ['ADMIN', 'STUDIO', 'SUPERVISOR'] },
  '/quotes/[id]/edit': { roles: ['ADMIN', 'STUDIO'] },
  '/quotes/[id]/preview': { roles: ['ADMIN', 'STUDIO', 'SUPERVISOR'] },
  '/finance/new': { roles: ['ADMIN', 'STUDIO'] },
  '/finance/report': { roles: ['ADMIN', 'STUDIO', 'SUPERVISOR'] },
  '/finance/[invoiceId]': { roles: ['ADMIN', 'STUDIO', 'SUPERVISOR'] },
  '/finance/[invoiceId]/edit': { roles: ['ADMIN', 'STUDIO'] },
  '/clients': { roles: ['ADMIN', 'STUDIO', 'SUPERVISOR'] },
  '/clients/import': { roles: ['ADMIN', 'STUDIO'] },
  '/clients/export': { roles: ['ADMIN', 'STUDIO', 'SUPERVISOR'] },
  '/clients/[id]': { roles: ['ADMIN', 'STUDIO', 'SUPERVISOR'] },
  '/clients/[id]/edit': { roles: ['ADMIN', 'STUDIO'] },
  '/calendar': { roles: ['ADMIN', 'STUDIO', 'SUPERVISOR'] },
  '/finance': { roles: ['ADMIN', 'STUDIO', 'SUPERVISOR'] },

  '/pricing': { roles: ['ADMIN', 'STUDIO', 'SUPERVISOR'] },

  '/settings': { roles: ['ADMIN', 'STUDIO'] },

  '/settings/notifications': { roles: ['ADMIN', 'STUDIO'] },
  '/users': { roles: ['ADMIN', 'STUDIO'] },

  '/users/roster/[team]': { roles: ['ADMIN', 'STUDIO'] },

  '/activity': { roles: ['ADMIN'] },

  '/quote/[token]': { token: true },
  '/contract/[token]': { token: true },
  '/invoice/[token]': { token: true },
}
