import type { ReactNode } from 'react'
import { Breadcrumb, type Crumb } from '@/components/Breadcrumb'

/**
 * The one page-header pattern every authenticated page uses, so the shell stays stable and only the
 * content changes between pages. A breadcrumb (location in the hierarchy) sits above the title; the
 * description sits below it; page-specific actions align to the right. Optional `children` render a
 * controls row (search / filters / sort) beneath the title block. The title uses Carbon heading-04
 * (text-2xl): now that the page descriptions are gone, a slightly larger title carries the header on
 * its own without leaving dead space. `eyebrow` is the legacy section label, kept only for pages not
 * yet migrated to `breadcrumb`.
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
  // Bottom gap to the page content is conditional: a page WITH a description keeps the roomier `mb-6`,
  // but a description-less page tightens to `mb-5` so the removed paragraph does not leave an empty
  // reserved band. (Pages whose first content block sets its own larger top margin own that gap via
  // margin-collapsing; those few are aligned to the same `mt-5` rhythm at the call site.)
  return (
    <div className={description ? 'mb-6' : 'mb-5'}>
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
          <h1 className="text-2xl font-semibold text-ink">{title}</h1>
          {/* Pages fill the workspace, but running text keeps a readable measure (~65 characters). */}
          {description ? <p className="mt-1 max-w-prose text-sm text-ink-muted">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children ? <div className="mt-5">{children}</div> : null}
    </div>
  )
}
