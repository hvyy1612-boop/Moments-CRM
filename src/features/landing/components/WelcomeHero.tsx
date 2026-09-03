import Link from 'next/link'

/**
 * The staff sign-in gateway shown at "/". A calm, editorial masthead for Moments Photography & Film:
 * the brand wordmark (editorial serif), one line of what the workspace does, and a single primary
 * action (Sign in). No marketing copy, no feature cards - the page's presence comes from typography,
 * spacing and the full-width photograph beneath it (rendered by the page). Sign in links to the
 * existing /login flow; auth is unchanged.
 */
export function WelcomeHero() {
  return (
    <section className="w-full max-w-3xl text-center">
      <div className="font-display text-4xl font-normal uppercase leading-none tracking-[0.2em] text-ink sm:text-6xl">
        Moments
      </div>
      <div className="mt-4 text-xs font-medium uppercase tracking-[0.3em] text-muted sm:text-sm">
        Photography &amp; Film &middot; Sydney
      </div>

      <h1 className="mt-14 font-display text-2xl font-normal leading-tight text-ink sm:text-4xl">
        Welcome to your studio workspace
      </h1>
      <p className="mx-auto mt-5 max-w-2xl text-base text-ink-muted sm:text-lg">
        Manage enquiries, projects, bookings, and payments in one place
      </p>

      <div className="mt-10">
        <Link
          href="/login"
          className="inline-flex h-12 items-center justify-center rounded-md bg-ink px-8 text-base font-medium text-surface outline-none transition-colors duration-150 hover:opacity-90 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 sm:h-14 sm:px-9"
        >
          Sign in
        </Link>
      </div>
    </section>
  )
}
