import type { ReactNode } from 'react'
import { Breadcrumb, type Crumb } from '@/components/Breadcrumb'

/**
 * The one page-header pattern every authenticated page uses, so the shell stays stable and only the
 * content changes between pages. A breadcrumb (location in the hierarchy) sits above the title; the
 * description sits below it; page-specific actions align to the right. Optional `children` render a
 * controls row (search / filters / sort) beneath the title block. The title uses Carbon heading-03
 * (text-xl) so it reads as a heading without dominating the page. `eyebrow` is the legacy section label,
 * kept only for pages not yet migrated to `breadcrumb`.
 */
export function PageHeader({
  breadcrumb,
  eyebrow,
  title,
  description,
  actions,
  children,
}: {
  breadcrumb?: Crumb[]
  eyebrow?: string
  title: string
  description?: string
  actions?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="mb-6">
      {breadcrumb ? (
        <div className="mb-2">
          <Breadcrumb items={breadcrumb} />
        </div>
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          {!breadcrumb && eyebrow ? (
            <div className="mb-1 text-xs font-semibold uppercase tracking-widest text-muted">{eyebrow}</div>
          ) : null}
          <h1 className="text-xl font-semibold text-ink">{title}</h1>
          {description ? <p className="mt-1 text-sm text-ink-muted">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children ? <div className="mt-5">{children}</div> : null}
    </div>
  )
}
