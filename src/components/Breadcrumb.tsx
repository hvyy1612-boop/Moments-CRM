import Link from 'next/link'

export type Crumb = { label: string; href?: string }

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
