import type { ReactNode } from 'react'

/**
 * One shared shell for every Lead-detail sidebar card (Client / Quotes / Invoices / Notes), so they all
 * carry the exact same padding, border, radius, header height, label style and header/body rhythm - no
 * per-card spacing left to drift. The header is a single row: the label on the left and an optional
 * action (a "+" / edit affordance) on the right, held to a fixed min height so a card with an action and
 * one without still line up. Presentational only (no directive), so it works in both the server page and
 * the client Notes card.
 */
export function SidebarCard({
  title,
  action,
  children,
}: {
  title: string
  /** Optional right-aligned control in the header (e.g. an add / edit icon button). */
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
