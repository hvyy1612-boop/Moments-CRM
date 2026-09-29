'use client'

import { type ReactNode, useEffect, useRef, useState } from 'react'
import Link from 'next/link'

export type SidebarItem = { key: string; label: string; href: string; group: string; built: boolean; icon: ReactNode }

/**
 * Desktop sidebar navigation. Presentational: the collapse state lives in AppChrome (shared with the
 * top-nav toggle). It carries no border or shadow and sits on the page background, so it flows down
 * from the top navigation as one continuous surface rather than a boxed panel.
 *
 * Three restrained touches (opt-in, on-brand): a slim maroon accent that slides between items (resting
 * on the active one, following the pointer on hover), a subtle hover nudge, and a small amber
 * notification dot on items with real recent activity (notifKeys, derived from alerts - never faked).
 */
export function Sidebar({
  items,
  groups,
  active,
  collapsed,
  notifKeys = [],
}: {
  items: SidebarItem[]
  groups: string[]
  active: string
  collapsed: boolean
  notifKeys?: string[]
}) {
  const notif = new Set(notifKeys)
  const navRef = useRef<HTMLElement>(null)
  const [indicator, setIndicator] = useState<{ top: number; height: number; shown: boolean }>({
    top: 0,
    height: 0,
    shown: false,
  })

  const moveTo = (el: HTMLElement | null) => {
    const nav = navRef.current
    if (!el || !nav) return
    setIndicator({ top: el.offsetTop, height: el.offsetHeight, shown: true })
  }
  const restToActive = () => {
    const el = navRef.current?.querySelector<HTMLElement>('[data-active="true"]') ?? null
    if (el) moveTo(el)
    else setIndicator((s) => ({ ...s, shown: false }))
  }

  // Snap the accent to the active item after render / on active or collapse change. useEffect (not
  // layout) keeps SSR quiet; the accent fades in once measured, which reads as a calm entrance.
  useEffect(() => {
    restToActive()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, collapsed, items.length])

  return (
    <aside className={`sticky top-16 hidden h-[calc(100vh-4rem)] shrink-0 flex-col bg-paper md:flex ${collapsed ? 'w-16' : 'w-56'}`}>
      <nav
        ref={navRef}
        onMouseLeave={restToActive}
        className="relative flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 pb-4 pt-2"
      >
        {/* Sliding accent rail: a single element that transitions between item positions. */}
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute left-0 w-1 rounded-full bg-accent transition-all duration-200 ease-out ${indicator.shown ? 'opacity-100' : 'opacity-0'}`}
          style={{ top: indicator.top, height: indicator.height }}
        />

        {groups.map((group) => {
          const groupItems = items.filter((n) => n.group === group)
          if (groupItems.length === 0) return null
          return (
            <div key={group} className="mb-2">
              {!collapsed && group !== 'Overview' ? (
                <div className="px-3 pb-1 pt-3 text-xs uppercase tracking-widest text-muted">{group}</div>
              ) : null}
              {groupItems.map((item) =>
                item.built ? (
                  <Link
                    key={item.key}
                    href={item.href}
                    data-active={item.key === active ? 'true' : undefined}
                    onMouseEnter={(e) => moveTo(e.currentTarget)}
                    title={collapsed ? item.label : undefined}
                    aria-current={item.key === active ? 'page' : undefined}
                    className={`relative flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-[background-color,color,transform] duration-150 ease-out ${collapsed ? 'justify-center' : ''} ${
                      item.key === active
                        ? 'bg-sunk font-medium text-ink'
                        : 'text-ink-muted hover:translate-x-0.5 hover:bg-sunk/50 hover:text-ink'
                    }`}
                  >
                    <span className="relative flex shrink-0">
                      {item.icon}
                      {notif.has(item.key) ? (
                        <span
                          aria-hidden="true"
                          className="absolute -right-1 -top-1 h-1.5 w-1.5 rounded-full bg-warn ring-2 ring-paper"
                        />
                      ) : null}
                    </span>
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
    </aside>
  )
}
