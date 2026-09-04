import type { ReactNode } from 'react'
import Link from 'next/link'
import { CommandPalette } from '@/components/CommandPalette'
import { AddNewMenu } from '@/components/AddNewMenu'
import { can, type Permission } from '@/lib/auth/authz'
import type { SessionUser } from '@/lib/auth/guard'
import { Sidebar } from './Sidebar'

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

export function AppShell({
  user,
  csrf,
  active,
  action,
  bareHeader = false,
  children,
}: {
  user: SessionUser
  csrf: string
  active: NavKey

  action?: ReactNode

  bareHeader?: boolean
  children: ReactNode
}) {
  const items = NAV.filter((n) => !n.permission || can(user, n.permission))
  const current = NAV.find((n) => n.key === active)
  const initial = user.name.trim().charAt(0).toUpperCase() || 'U'

  return (
    <div className="flex min-h-screen bg-paper">
      {/* Collapsible desktop sidebar (icon rail + account menu) - see Sidebar.tsx. */}
      <Sidebar
        items={items}
        groups={GROUPS}
        active={active}
        userName={user.name}
        userRole={user.role}
        initial={initial}
        csrf={csrf}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar (D-21): hidden when the page renders its own full-width header (bareHeader). */}
        {bareHeader ? null : (
        <header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b border-line bg-surface px-5 sm:px-8">
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-widest text-muted">
              {current?.group ?? 'Moments'}
            </div>
            <div className="font-serif text-xl font-semibold leading-none text-ink">
              {current?.label ?? 'Moments'}
            </div>
          </div>
          <div className="flex-1" />
          <CommandPalette />
          <AddNewMenu />
          {action}
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-accent-tint font-serif text-sm text-accent-ink md:hidden">
            {initial}
          </span>
        </header>
        )}

        {/* Mobile navigation (below md, where the sidebar is hidden). */}
        <nav className="flex gap-1 overflow-x-auto border-b border-line bg-surface px-4 py-2 md:hidden">
          {items
            .filter((i) => i.built)
            .map((item) => (
              <Link
                key={item.key}
                href={item.href}
                aria-current={item.key === active ? 'page' : undefined}
                className={`shrink-0 rounded px-2.5 py-1.5 text-sm ${
                  item.key === active ? 'bg-sunk font-medium text-ink' : 'text-ink-muted'
                }`}
              >
                {item.label}
              </Link>
            ))}
        </nav>

        <main className="w-full flex-1 px-6 py-8 sm:px-8">{children}</main>
      </div>
    </div>
  )
}
