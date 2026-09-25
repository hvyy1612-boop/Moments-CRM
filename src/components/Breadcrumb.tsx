import Link from 'next/link'

/**
 * Carbon-style breadcrumb - the one secondary-navigation control every page uses to show where it sits
 * in the hierarchy and to move back up. https://carbondesignsystem.com/components/breadcrumb/usage/
 * Ancestor items are muted links that darken to the accent on hover; the current page is plain text
 * (aria-current) and never a link; items are separated by "/". This replaces the old section eyebrow on
 * list pages and the back link on detail pages, so location + up-navigation look identical everywhere.
 */
export type Crumb = { label: string; href?: string }

// Every trail starts at the app home, so the root crumb is shared.
export const DASHBOARD_CRUMB: Crumb = { label: 'Dashboard', href: '/dashboard' }

export function Breadcrumb({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-muted">
        {items.map((c, i) => {
          const last = i === items.length - 1
          return (
            <li key={i} className="flex items-center gap-x-2">
              {c.href && !last ? (
                <Link href={c.href} className="transition-colors hover:text-accent">{c.label}</Link>
              ) : (
                <span className={last ? 'text-ink' : undefined} aria-current={last ? 'page' : undefined}>{c.label}</span>
              )}
              {!last ? <span aria-hidden className="select-none text-muted">/</span> : null}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
