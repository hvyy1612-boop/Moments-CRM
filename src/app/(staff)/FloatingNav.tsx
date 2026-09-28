import Link from 'next/link'
import type { SidebarItem } from './Sidebar'

/**
 * A slim floating vertical navigation pill (icon-only) fixed on the left of the app. It reuses the
 * shared nav items, routes and active key - only the presentation changes. Dark translucent glass with
 * a subtle purple glow on the active item; a short divider separates Settings at the bottom. Colours and
 * effects come from the `.fnav*` classes in globals.css; this component only handles layout + structure.
 * Hidden below md, where the app keeps its existing horizontal mobile nav.
 */
export function FloatingNav({
  items,
  active,
  notifKeys = [],
}: {
  items: SidebarItem[]
  active: string
  notifKeys?: string[]
}) {
  const notif = new Set(notifKeys)
  const built = items.filter((i) => i.built)
  const main = built.filter((i) => i.key !== 'settings')
  const settings = built.find((i) => i.key === 'settings') ?? null

  const renderItem = (item: SidebarItem) => {
    const isActive = item.key === active
    return (
      <Link
        key={item.key}
        href={item.href}
        aria-label={item.label}
        aria-current={isActive ? 'page' : undefined}
        className={`fnav-item group relative flex h-10 w-10 items-center justify-center border border-transparent ${
          isActive ? 'fnav-active rounded-2xl' : 'rounded-xl'
        }`}
      >
        {item.icon}
        {notif.has(item.key) ? (
          <span aria-hidden="true" className="fnav-dot absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full" />
        ) : null}
        <span
          aria-hidden="true"
          className="fnav-tip pointer-events-none absolute left-full top-1/2 z-10 ml-3 -translate-y-1/2 whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
        >
          {item.label}
        </span>
      </Link>
    )
  }

  return (
    <nav
      aria-label="Primary"
      className="fnav fixed left-6 top-1/2 z-40 hidden -translate-y-1/2 flex-col items-center gap-1.5 rounded-full p-2 md:flex"
    >
      {main.map(renderItem)}
      {settings ? (
        <>
          <span aria-hidden="true" className="fnav-divider mb-2 mt-3 h-px w-6 rounded-full" />
          {renderItem(settings)}
        </>
      ) : null}
    </nav>
  )
}
