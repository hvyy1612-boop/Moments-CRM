import type { ReactNode } from 'react'

export function SidebarCard({
  title,
  action,
  children,
}: {
  title: string

  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="rounded-md border border-line-strong bg-surface p-4">
      <div className="mb-3 flex min-h-7 items-center justify-between gap-2">
        <h2 className="text-xs font-medium uppercase tracking-wider text-muted">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}
