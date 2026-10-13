import type { ReactNode } from 'react'

/**
 * The one canonical page-content container for the whole authenticated app. A page declares WHAT layout
 * it needs (its variant); this component decides HOW that is implemented. It owns the page's max-width
 * and centring only - the uniform workspace gutter (horizontal padding) is owned once by `<main>` in
 * AppChrome, so there is never double padding and no page can end up flush against the sidebar.
 *
 * Every working page fills the workspace like the Calendar - no empty side gutters on wide screens.
 * Only focused single-column forms keep a readable measure.
 *  - narrow   readable/form measure, centred   (focused single-column forms)
 *  - standard fills the workspace              (lists, detail pages, the default)
 *  - wide     fills the workspace              (dashboards, job workspace)
 *  - full     fills the workspace              (Calendar)
 * standard/wide/full are kept as separate names so a page still states its intent, and a bounded measure
 * can be reintroduced here in one place without touching every page.
 *
 * Pages must NOT set their own max-w / mx-auto / horizontal padding / viewport calc - they use a variant.
 */
export type PageVariant = 'narrow' | 'standard' | 'wide' | 'full'

/** The single responsive page gutter (Carbon-ish rhythm: 16 -> 24 -> 32). Owned here, never on <main>. */
const GUTTER = 'px-4 sm:px-6 lg:px-8'

const MEASURE: Record<PageVariant, string> = {
  narrow: 'mx-auto w-full max-w-page-narrow',
  standard: 'w-full',
  wide: 'w-full',
  full: 'w-full',
}

export function PageContainer({
  variant = 'standard',
  className,
  children,
}: {
  variant?: PageVariant
  /** Extra classes for the content wrapper (e.g. vertical rhythm). Never for width/centring/gutter. */
  className?: string
  children: ReactNode
}) {
  return <div className={`${GUTTER} ${MEASURE[variant]}${className ? ` ${className}` : ''}`}>{children}</div>
}
