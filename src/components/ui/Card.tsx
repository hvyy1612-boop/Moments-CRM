import type { ReactNode } from 'react'

export function Card({
  title,
  actions,
  children,
}: {
  title?: string
  actions?: ReactNode
  children: ReactNode
}) {
  const hasHeader = Boolean(title) || Boolean(actions)
  return (
    <section className="rounded border border-line bg-surface">
      {hasHeader ? (
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          {title ? <h3 className="text-base font-semibold text-ink">{title}</h3> : <span />}
          {actions}
        </header>
      ) : null}
      <div className="p-4">{children}</div>
    </section>
  )
}
