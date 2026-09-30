

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

  '/api/cron/daily': { secret: true },

  '/api/webhooks/resend': { secret: true },
  '/api/calendar/feed': { token: true },

  '/api/auth/google': { public: true },
  '/api/auth/google/callback': { public: true },

  '/login': { public: true },
  '/forgot': { public: true },
  '/reset/[token]': { public: true },

  '/change-password': { roles: ['ADMIN', 'STUDIO', 'EDITOR'] },

  '/dashboard': { roles: ['ADMIN', 'STUDIO'] },
  '/leads': { roles: ['ADMIN', 'STUDIO'] },
  '/leads/report': { roles: ['ADMIN', 'STUDIO'] },
  '/leads/[id]': { roles: ['ADMIN', 'STUDIO'] },
  '/jobs': { roles: ['ADMIN', 'STUDIO'] },
  '/jobs/report': { roles: ['ADMIN', 'STUDIO'] },
  '/jobs/[id]': { roles: ['ADMIN', 'STUDIO'] },

  '/quotes': { roles: ['ADMIN', 'STUDIO'] },
  '/quotes/new': { roles: ['ADMIN', 'STUDIO'] },
  '/quotes/[id]': { roles: ['ADMIN', 'STUDIO'] },
  '/quotes/[id]/edit': { roles: ['ADMIN', 'STUDIO'] },
  '/quotes/[id]/preview': { roles: ['ADMIN', 'STUDIO'] },
  '/jobs/[id]/invoice/[invoiceId]': { roles: ['ADMIN', 'STUDIO'] },
  '/finance/new': { roles: ['ADMIN', 'STUDIO'] },
  '/finance/report': { roles: ['ADMIN', 'STUDIO'] },
  '/finance/[invoiceId]': { roles: ['ADMIN', 'STUDIO'] },
  '/finance/[invoiceId]/edit': { roles: ['ADMIN', 'STUDIO'] },
  '/clients': { roles: ['ADMIN', 'STUDIO'] },
  '/clients/new': { roles: ['ADMIN', 'STUDIO'] },
  '/clients/import': { roles: ['ADMIN', 'STUDIO'] },
  '/clients/export': { roles: ['ADMIN', 'STUDIO'] },
  '/clients/[id]': { roles: ['ADMIN', 'STUDIO'] },
  '/clients/[id]/edit': { roles: ['ADMIN', 'STUDIO'] },
  '/calendar': { roles: ['ADMIN', 'STUDIO'] },
  '/finance': { roles: ['ADMIN', 'STUDIO'] },

  '/pricing': { roles: ['ADMIN', 'STUDIO'] },

  '/settings': { roles: ['ADMIN'] },

  '/settings/notifications': { roles: ['ADMIN'] },
  '/users': { roles: ['ADMIN'] },

  '/users/roster/[team]': { roles: ['ADMIN'] },

  '/activity': { roles: ['ADMIN'] },

  '/quote/[token]': { token: true },
  '/contract/[token]': { token: true },
  '/gallery/[token]': { token: true },
  '/invoice/[token]': { token: true },
  '/questionnaire/[token]': { token: true },
  '/portal/[token]': { token: true },
}
