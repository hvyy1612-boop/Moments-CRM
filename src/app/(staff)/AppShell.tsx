import type { ReactNode } from 'react'
import { can, type Permission } from '@/lib/auth/authz'
import type { SessionUser } from '@/lib/auth/guard'
import { getRecentAlerts } from '@/lib/domain/alerts'
import { AppChrome } from './AppChrome'

export type NavKey =
  | 'dashboard'
  | 'enquiries'
  | 'jobs'
  | 'clients'
  | 'calendar'
  | 'finance'
  | 'activity'
  | 'settings'
  | 'users'

type NavGroup = 'Overview' | 'Studio' | 'Operations' | 'System'
type NavItem = {
  key: NavKey
  label: string
  href: string
  group: NavGroup
  built: boolean
  /** When set, the item shows only for users whose role grants this permission. */
  permission?: Permission
  icon: ReactNode
}

// Order follows Monday's logic: the entities you work in every day come first (enquiries → jobs →
// clients), then operations, then the Dashboard as an overview near the end (not first).
const GROUPS: NavGroup[] = ['Overview', 'Studio', 'Operations', 'System']

const S = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const
function svg(children: ReactNode): ReactNode {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" {...S}>
      {children}
    </svg>
  )
}

const NAV: NavItem[] = [
  { key: 'clients', label: 'Clients', href: '/clients', group: 'Studio', built: true, icon: svg(<><circle cx="9" cy="8" r="3" /><path d="M3 20a6 6 0 0 1 12 0" /><path d="M16 6a3 3 0 0 1 0 6M18 20a5 5 0 0 0-3-4.6" /></>) },
  { key: 'enquiries', label: 'Enquiries', href: '/enquiries', group: 'Studio', built: true, icon: svg(<><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></>) },
  { key: 'jobs', label: 'Jobs', href: '/jobs', group: 'Studio', built: true, icon: svg(<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />) },
  { key: 'calendar', label: 'Calendar', href: '/calendar', group: 'Operations', built: true, icon: svg(<><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 2v4M16 2v4" /></>) },
  { key: 'finance', label: 'Payments', href: '/finance', group: 'Operations', built: true, icon: svg(<path d="M12 2v20M17 6.5C17 4.5 14.8 3.5 12 3.5S7 4.7 7 6.8s2 2.7 5 3.4 5 1.4 5 3.5-2.2 3.3-5 3.3-5-1.1-5-3" />) },
  { key: 'dashboard', label: 'Dashboard', href: '/dashboard', group: 'Overview', built: true, icon: svg(<><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>) },
  { key: 'activity', label: 'Activity', href: '/activity', group: 'System', built: true, permission: 'AUTH_LOG_VIEW', icon: svg(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></>) },
  { key: 'settings', label: 'Settings', href: '/settings', group: 'System', built: true, permission: 'SETTINGS_EDIT', icon: svg(<><circle cx="12" cy="12" r="3" /><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2l-.4-2.6H9.9l-.4 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2l.4 2.6h4.2l.4-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2Z" /></>) },
  { key: 'users', label: 'Users', href: '/users', group: 'System', built: true, permission: 'USER_MANAGE', icon: svg(<><circle cx="9" cy="8" r="3" /><path d="M3 20a6 6 0 0 1 12 0" /><path d="M16 3.5a3 3 0 0 1 0 5.8M21 20a5 5 0 0 0-4-4.9" /></>) },
]

/**
 * The authenticated shell every page renders inside. It provides the ONE shared navigation (global top
 * nav + sidebar) via AppChrome; each page supplies its own in-content header (see PageHeader). The
 * `action` / `bareHeader` / `hideAddNew` props are retained as accepted no-ops so existing call sites
 * keep compiling while page headers move into content - page actions now live in each page's header.
 */
export async function AppShell({
  user,
  csrf,
  active,
  children,
}: {
  user: SessionUser
  csrf: string
  active: NavKey
  /** Deprecated: page actions now live in the page's own PageHeader, not the shell. */
  action?: ReactNode
  /** Deprecated no-op: every page now renders its own in-content header. */
  bareHeader?: boolean
  /** Deprecated no-op: the global "Add new" menu was removed from the top nav. */
  hideAddNew?: boolean
  children: ReactNode
}) {
  const items = NAV.filter((n) => !n.permission || can(user, n.permission))
  const initial = user.name.trim().charAt(0).toUpperCase() || 'U'
  const alerts = await getRecentAlerts()

  return (
    <AppChrome
      items={items}
      groups={GROUPS}
      active={active}
      initial={initial}
      userName={user.name}
      userRole={user.role}
      csrf={csrf}
      alerts={alerts}
    >
      {children}
    </AppChrome>
  )
}
