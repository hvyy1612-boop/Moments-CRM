import Link from 'next/link'

/**
 * The one "back" control every detail and sub-page uses, so returning to the parent looks identical
 * everywhere. A muted chevron plus label that darkens on hover - never the louder accent arrow some
 * pages used before. Pass the destination href and the label to show beside the chevron.
 */
export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-0.5 text-sm text-ink-muted transition-colors hover:text-ink"
    >
      <svg
        viewBox="0 0 24 24"
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M15 6l-6 6 6 6" />
      </svg>
      {label}
    </Link>
  )
}
