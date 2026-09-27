import type { ReactNode } from 'react'
import { can, type Permission } from '@/lib/auth/authz'
import type { SessionUser } from '@/lib/auth/guard'
import { getRecentAlerts } from '@/lib/domain/alerts'
import { AppChrome } from './AppChrome'

export type NavKey =
  | 'dashboard'
  | 'enquiries'
  | 'quotes'
  | 'jobs'
  | 'clients'
  | 'calendar'
  | 'finance'
  | 'pricing'
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

  permission?: Permission
  icon: ReactNode
}

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
  { key: 'clients', label: 'Clients', href: '/clients', group: 'Studio', built: true, icon: svg(<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>) },
  { key: 'enquiries', label: 'Enquiries', href: '/enquiries', group: 'Studio', built: true, icon: svg(<><rect width="20" height="16" x="2" y="4" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" /></>) },
  { key: 'quotes', label: 'Quotes', href: '/quotes', group: 'Studio', built: true, icon: svg(<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M8 13h5" /><path d="M8 17h8" /></>) },
  { key: 'jobs', label: 'Jobs', href: '/jobs', group: 'Studio', built: true, icon: svg(<><path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /><rect width="20" height="14" x="2" y="6" rx="2" /></>) },
  { key: 'calendar', label: 'Calendar', href: '/calendar', group: 'Operations', built: true, icon: svg(<><path d="M8 2v4" /><path d="M16 2v4" /><rect width="18" height="18" x="3" y="4" rx="2" /><path d="M3 10h18" /><path d="m9 16 2 2 4-4" /></>) },
  { key: 'finance', label: 'Payments', href: '/finance', group: 'Operations', built: true, icon: svg(<><rect width="20" height="14" x="2" y="5" rx="2" /><line x1="2" x2="22" y1="10" y2="10" /></>) },
  { key: 'dashboard', label: 'Dashboard', href: '/dashboard', group: 'Overview', built: true, icon: svg(<><rect width="7" height="9" x="3" y="3" rx="1" /><rect width="7" height="5" x="14" y="3" rx="1" /><rect width="7" height="9" x="14" y="12" rx="1" /><rect width="7" height="5" x="3" y="16" rx="1" /></>) },
  { key: 'activity', label: 'Activity', href: '/activity', group: 'System', built: true, permission: 'AUTH_LOG_VIEW', icon: svg(<><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /><path d="M12 7v5l4 2" /></>) },
  { key: 'settings', label: 'Settings', href: '/settings', group: 'System', built: true, permission: 'SETTINGS_EDIT', icon: svg(<><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></>) },
  { key: 'users', label: 'Users', href: '/users', group: 'System', built: true, permission: 'USER_MANAGE', icon: svg(<><circle cx="18" cy="15" r="3" /><circle cx="9" cy="7" r="4" /><path d="M10 15H6a4 4 0 0 0-4 4v2" /><path d="m21.7 16.4-.9-.3" /><path d="m15.2 13.9-.9-.3" /><path d="m16.6 18.7.3-.9" /><path d="m19.1 12.2.3-.9" /><path d="m19.6 18.7-.4-1" /><path d="m16.8 12.3-.4-1" /><path d="m14.3 16.6 1-.4" /><path d="m20.7 13.8 1-.4" /></>) },
]

export async function AppShell({
  user,
  csrf,
  active,
  children,
}: {
  user: SessionUser
  csrf: string
  active: NavKey

  action?: ReactNode

  bareHeader?: boolean

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
