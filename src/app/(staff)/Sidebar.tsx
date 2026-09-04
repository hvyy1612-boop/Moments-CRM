'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { signOut } from './actions'

export type SidebarItem = { key: string; label: string; href: string; group: string; built: boolean; icon: ReactNode }

const COLLAPSE_KEY = 'sidebar.collapsed'

/** Collapsible desktop sidebar (icon rail when collapsed) with an account menu that holds Sign out. */
export function Sidebar({
  items,
  groups,
  active,
  userName,
  userRole,
  initial,
  csrf,
}: {
  items: SidebarItem[]
  groups: string[]
  active: string
  userName: string
  userRole: string
  initial: string
  csrf: string
}) {
  const [collapsed, setCollapsed] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

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
    <aside className={`sticky top-0 hidden h-screen shrink-0 flex-col border-r border-line bg-surface md:flex ${collapsed ? 'w-16' : 'w-56'}`}>
      <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-4">
        {collapsed ? (
          <span className="mx-auto text-sm font-semibold uppercase tracking-widest text-ink">M</span>
        ) : (
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold uppercase tracking-[0.18em] leading-none text-ink">Moments</div>
            <div className="mt-1 truncate text-xs uppercase text-muted">Photography &amp; Film</div>
          </div>
        )}
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={`shrink-0 rounded p-1 text-ink-muted transition-colors hover:bg-paper hover:text-ink ${collapsed ? 'absolute right-1 top-4' : ''}`}
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d={collapsed ? 'M9 6l6 6-6 6' : 'M15 6l-6 6 6 6'} />
          </svg>
        </button>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-3">
        {groups.map((group) => {
          const groupItems = items.filter((n) => n.group === group)
          if (groupItems.length === 0) return null
          return (
            <div key={group} className="mb-2">
              {!collapsed ? <div className="px-2 pb-1 pt-2 text-xs uppercase tracking-widest text-muted">{group}</div> : null}
              {groupItems.map((item) =>
                item.built ? (
                  <Link
                    key={item.key}
                    href={item.href}
                    title={collapsed ? item.label : undefined}
                    aria-current={item.key === active ? 'page' : undefined}
                    className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${collapsed ? 'justify-center' : ''} ${
                      item.key === active ? 'bg-sunk font-medium text-ink' : 'text-ink-muted hover:bg-paper hover:text-ink'
                    }`}
                  >
                    {item.icon}
                    {!collapsed ? item.label : null}
                  </Link>
                ) : (
                  <span
                    key={item.key}
                    aria-disabled="true"
                    title={item.label}
                    className={`flex cursor-default items-center gap-3 rounded-md px-3 py-2 text-sm text-ink-muted opacity-40 ${collapsed ? 'justify-center' : ''}`}
                  >
                    {item.icon}
                    {!collapsed ? item.label : null}
                  </span>
                ),
              )}
            </div>
          )
        })}
      </nav>

      <div className="relative border-t border-line p-2">
        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          className={`flex w-full items-center gap-3 rounded-md p-2 text-left transition-colors hover:bg-paper ${collapsed ? 'justify-center' : ''}`}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-tint text-sm font-semibold text-accent-ink">{initial}</span>
          {!collapsed ? (
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-ink">{userName}</span>
              <span className="block truncate text-xs capitalize text-ink-muted">{userRole.toLowerCase()}</span>
            </span>
          ) : null}
        </button>
        {menuOpen ? (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} aria-hidden="true" />
            <div role="menu" className="absolute bottom-full left-2 right-2 z-50 mb-1 rounded-md border border-line bg-surface p-1 shadow-lg">
              <form action={signOut}>
                <input type="hidden" name="csrf" value={csrf} />
                <button type="submit" role="menuitem" className="block w-full rounded px-3 py-1.5 text-left text-sm text-ink hover:bg-paper">
                  Sign out
                </button>
              </form>
            </div>
          </>
        ) : null}
      </div>
    </aside>
  )
}
