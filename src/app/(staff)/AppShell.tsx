import type { ReactNode } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import type { SessionUser } from '@/lib/auth/guard'
import { signOut } from './actions'

export type NavKey =
  | 'dashboard'
  | 'projects'
  | 'clients'
  | 'calendar'
  | 'finance'
  | 'activity'
  | 'settings'

type NavItem = { key: NavKey; label: string; href: string; built: boolean; adminOnly?: boolean; icon: ReactNode }

const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' } as const
function svg(children: ReactNode): ReactNode {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" {...S}>
      {children}
    </svg>
  )
}

const NAV: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', href: '/dashboard', built: true, icon: svg(<><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" /></>) },
  { key: 'projects', label: 'Projects', href: '/projects', built: true, icon: svg(<><path d="M3 7h18M3 12h18M3 17h11" /></>) },
  { key: 'clients', label: 'Clients', href: '/clients', built: false, icon: svg(<><circle cx="12" cy="8" r="3.5" /><path d="M5 20c0-3.5 3-5.5 7-5.5s7 2 7 5.5" /></>) },
  { key: 'calendar', label: 'Calendar', href: '/calendar', built: false, icon: svg(<><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 2v4M16 2v4" /></>) },
  { key: 'finance', label: 'Finance', href: '/finance', built: false, icon: svg(<><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></>) },
  { key: 'activity', label: 'Activity', href: '/activity', built: true, adminOnly: true, icon: svg(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></>) },
  { key: 'settings', label: 'Settings', href: '/settings', built: false, icon: svg(<><circle cx="12" cy="12" r="3" /><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2l-.4-2.6H9.9l-.4 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2l.4 2.6h4.2l.4-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2Z" /></>) },
]

export function AppShell({
  user,
  csrf,
  active,
  children,
}: {
  user: SessionUser
  csrf: string
  active: NavKey
  children: ReactNode
}) {
  const items = NAV.filter((n) => !n.adminOnly || user.role === 'ADMIN')

  return (
    <div className="flex min-h-screen bg-paper">
      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-line bg-surface md:flex">
        <div className="px-5 pb-4 pt-5">
          <div className="font-serif text-lg leading-none text-ink">Moments</div>
          <div className="mt-1 text-xs uppercase tracking-widest text-ink-muted">Studio</div>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 px-3 py-2">
          {items.map((item) =>
            item.built ? (
              <Link
                key={item.key}
                href={item.href}
                aria-current={item.key === active ? 'page' : undefined}
                className={`flex items-center gap-3 rounded px-3 py-2 text-sm transition-colors ${
                  item.key === active
                    ? 'bg-paper font-medium text-accent'
                    : 'text-ink-muted hover:bg-paper hover:text-ink'
                }`}
              >
                {item.icon}
                {item.label}
              </Link>
            ) : (
              <span
                key={item.key}
                aria-disabled="true"
                className="flex cursor-default items-center gap-3 rounded px-3 py-2 text-sm text-ink-muted opacity-40"
              >
                {item.icon}
                {item.label}
              </span>
            ),
          )}
        </nav>
        <div className="border-t border-line px-4 py-4">
          <div className="text-sm text-ink">{user.name}</div>
          <div className="text-xs text-ink-muted">{user.role}</div>
          <form action={signOut} className="mt-3">
            <input type="hidden" name="csrf" value={csrf} />
            <Button type="submit" variant="secondary" size="sm">
              Sign out
            </Button>
          </form>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-line bg-surface px-4 py-3 md:hidden">
          <span className="font-serif text-lg text-ink">Moments</span>
          <nav className="flex gap-1">
            {items.filter((i) => i.built).map((item) => (
              <Link
                key={item.key}
                href={item.href}
                aria-current={item.key === active ? 'page' : undefined}
                className={`rounded px-2.5 py-1.5 text-sm ${
                  item.key === active ? 'text-accent' : 'text-ink-muted'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-8 sm:px-8">{children}</main>
      </div>
    </div>
  )
}
