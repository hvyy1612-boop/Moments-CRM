import type { ReactNode } from 'react'
import Link from 'next/link'
import type { Alert } from '@/lib/domain/alerts'
import type { SidebarItem } from './Sidebar'
import { FloatingNav } from './FloatingNav'
import { TopNav } from './TopNav'

/**
 * The single authenticated application shell: a global top nav, the app's existing horizontal mobile nav
 * (below md), and a slim floating navigation pill (md and up) that overlays the left edge. The pill is
 * fixed/vertically-centred, so `main` reserves left padding on md+ to clear it. Notification dots are
 * derived from real recent alerts (enquiries / payments), never hard-coded.
 */
export function AppChrome({
  items,
  active,
  initial,
  userName,
  userRole,
  csrf,
  alerts,
  children,
}: {
  items: SidebarItem[]
  active: string
  initial: string
  userName: string
  userRole: string
  csrf: string
  alerts: Alert[]
  children: ReactNode
}) {
  const notifKeys = Array.from(
    new Set(
      alerts
        .map((a) => (a.kind === 'enquiry' ? 'enquiries' : a.kind === 'payment' ? 'finance' : ''))
        .filter(Boolean),
    ),
  )

  return (
    <div className="min-h-screen bg-paper">
      <TopNav initial={initial} userName={userName} userRole={userRole} csrf={csrf} alerts={alerts} />

      {/* Mobile navigation (below md, where the floating pill is hidden). */}
      <nav className="flex gap-1 overflow-x-auto bg-paper px-3 pb-2 md:hidden">
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

      <FloatingNav items={items} active={active} notifKeys={notifKeys} />

      {/* main reserves left room on md+ so page content never sits under the floating pill. */}
      <main className="min-w-0 pb-6 pt-1.5 sm:pb-8 md:pl-24">{children}</main>
    </div>
  )
}
