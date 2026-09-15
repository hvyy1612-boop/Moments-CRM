import type { ReactNode } from 'react'

/**
 * The one page-header pattern every authenticated page uses, so the shell stays stable and only the
 * content changes between pages. Eyebrow (section) sits above the title; the description sits below it;
 * page-specific actions align to the right. Optional `children` render a controls row (search / filters
 * / sort) beneath the title block. Consistency comes from position and spacing, not from forcing the
 * same controls onto every page.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  children,
}: {
  eyebrow?: string
  title: string
  description?: string
  actions?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="mb-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          {eyebrow ? (
            <div className="text-xs font-semibold uppercase tracking-widest text-muted">{eyebrow}</div>
          ) : null}
          <h1 className="mt-1 text-3xl font-semibold text-ink">{title}</h1>
          {description ? <p className="mt-1 text-sm text-ink-muted">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children ? <div className="mt-5">{children}</div> : null}
    </div>
  )
}
