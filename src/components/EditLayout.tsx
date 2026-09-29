import type { ReactNode } from 'react'

/**
 * A single edit-page band split into a wider MAIN region and a narrower ASIDE that SHARE A TOP
 * KEYLINE: they are columns of the same grid row, so neither drifts when the other grows, and they
 * collapse to main-then-aside below `lg`. Use it for the "Notes + Financial summary" row on the
 * quote / invoice / job editors.
 *
 * This exists to replace the old anti-pattern - one big grid whose items were placed by hand with
 * `col-start` / `row-start`, which let the left and right content fall onto different rows and open
 * large dead vertical gaps. Stack these rows inside a `flex flex-col gap-8` (or similar) so the page
 * reads as a sequence of semantic rows.
 *
 * `items-start` keeps each region sized to its own content: the requirement is a shared TOP edge,
 * never forced equal height. Main is 8/12 (noticeably wider), aside 4/12 (comfortable) - no empty
 * gutter column, the horizontal gap comes from `gap-x-8`.
 */
export function MainAside({
  main,
  aside,
  className = '',
}: {
  main: ReactNode
  aside: ReactNode
  className?: string
}) {
  return (
    <div className={`grid grid-cols-1 items-start gap-x-8 gap-y-6 lg:grid-cols-12 ${className}`}>
      <div className="min-w-0 lg:col-span-8">{main}</div>
      <aside className="lg:col-span-4">{aside}</aside>
    </div>
  )
}
