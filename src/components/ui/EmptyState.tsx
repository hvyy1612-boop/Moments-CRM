import type { ReactNode } from 'react'

// Empty states name what belongs here, why it is empty, and how to fill it (§10.3). Left aligned,
// never centred (§10.2).
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-start gap-3 rounded border border-dashed border-line bg-paper px-5 py-8">
      <div className="flex flex-col gap-1">
        <p className="text-base font-semibold text-ink">{title}</p>
        <p className="max-w-prose text-sm text-ink-muted">{description}</p>
      </div>
      {action}
    </div>
  )
}
