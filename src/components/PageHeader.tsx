import type { ReactNode } from 'react'
import { Breadcrumb, type Crumb } from '@/components/Breadcrumb'

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
