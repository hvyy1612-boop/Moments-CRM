import Link from 'next/link'
import type { ReactNode } from 'react'

/**
 * The shell every public page shares.
 *
 * It exists because the pages were built one at a time and never looked at as a website: a
 * visitor landing on /packages from a search had no way home and no way to enquire. A route group
 * layout is the right place for it, since it wraps exactly the public pages and nothing else.
 */
export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-line">
        <div className="mx-auto flex w-full max-w-3xl flex-wrap items-baseline justify-between gap-4 px-4 py-5">
          <Link href="/" className="text-base font-medium text-ink">
            Moments Photography and Film
          </Link>
          <nav className="flex gap-5 text-sm">
            <Link
              href="/enquire"
              className="text-ink-muted transition-colors duration-150 hover:text-ink"
            >
              Enquire
            </Link>
          </nav>
        </div>
      </header>

      <div className="flex-1">{children}</div>

      <footer className="border-t border-line">
        <div className="mx-auto w-full max-w-3xl px-4 py-6">
          <p className="text-sm text-ink">Moments Photography and Film</p>
          <p className="mt-1 text-xs text-ink-muted">
            Sydney, New South Wales. Travel beyond the city is quoted for each job.
          </p>
        </div>
      </footer>
    </div>
  )
}
