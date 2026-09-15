import type { ReactNode } from 'react'
import Link from 'next/link'

export type SidebarItem = { key: string; label: string; href: string; group: string; built: boolean; icon: ReactNode }

export function Sidebar({
  items,
  groups,
  active,
  collapsed,
}: {
  items: SidebarItem[]
  groups: string[]
  active: string
  collapsed: boolean
}) {
  return (
    <aside className={`sticky top-16 hidden h-[calc(100vh-4rem)] shrink-0 flex-col bg-paper md:flex ${collapsed ? 'w-16' : 'w-56'}`}>
      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 pb-4 pt-2">
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
                    title={collapsed ? item.label : undefined}
                    aria-current={item.key === active ? 'page' : undefined}
                    className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${collapsed ? 'justify-center' : ''} ${
                      item.key === active ? 'bg-sunk font-medium text-ink' : 'text-ink-muted hover:bg-sunk/60 hover:text-ink'
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
    </aside>
  )
}
