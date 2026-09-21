'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import type { Alert } from '@/lib/domain/alerts'
import { Sidebar, type SidebarItem } from './Sidebar'
import { TopNav } from './TopNav'

const COLLAPSE_KEY = 'sidebar.collapsed'

/**
 * The single authenticated application shell. Holds the sidebar collapse state so the top-nav toggle
 * and the sidebar stay in sync, and lays out one continuous nav surface (top nav + sidebar) beside the
 * page content. There is no border or shadow between the top nav and the sidebar - they share the page
 * background and are separated only by spacing and alignment.
 */
export function AppChrome({
  items,
  groups,
  active,
  initial,
  userName,
  userRole,
  csrf,
  alerts,
  children,
}: {
  items: SidebarItem[]
  groups: string[]
  active: string
  initial: string
  userName: string
  userRole: string
  csrf: string
  alerts: Alert[]
  children: ReactNode
}) {
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === '1')
    } catch {
      /* ignore */
    }
  }, [])

  function toggle() {
    setCollapsed((c) => {
      const next = !c
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0')
      } catch {
        /* ignore */
      }
      return next
    })
  }

  return (
    <div className="min-h-screen bg-paper">
      <TopNav
        collapsed={collapsed}
        onToggle={toggle}
        initial={initial}
        userName={userName}
        userRole={userRole}
        csrf={csrf}
        alerts={alerts}
      />

      {/* Mobile navigation (below md, where the sidebar is hidden). */}
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

      <div className="flex">
        <Sidebar items={items} groups={groups} active={active} collapsed={collapsed} />
        {/* Page content starts snug under the top nav (shared across every page): a small fixed top
            padding at all widths, with only the horizontal and bottom padding growing on larger screens. */}
        <main className="min-w-0 flex-1 px-4 pb-6 pt-1.5 sm:px-8 sm:pb-8">{children}</main>
      </div>
    </div>
  )
}
