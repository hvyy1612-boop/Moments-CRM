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
  // This bottom gap is the ONE canonical title-to-content rule for every page: the roomier `mb-6` when
  // a description is present, the tighter `mb-4` when it is not - no reserved band for the removed
  // paragraph. Individual pages must NOT add their own top margin to their first content block;
  // PageHeader owns this spacing so every list page stays on the same rhythm.
  return (
    <div className={description ? 'mb-6' : 'mb-4'}>
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
