import Image from 'next/image'
import Link from 'next/link'

/**
 * The staff sign-in gateway shown at "/". A calm, editorial masthead for Moments Photography & Film.
 * The MOMENTS wordmark is the studio's own reference lettering (public/landing/wordmark.png, background
 * keyed to transparent) rather than a substitute web font, so it matches the brand artwork exactly;
 * alt="MOMENTS" keeps it accessible. The heading uses Cormorant Garamond and the supporting text uses
 * Manrope, sized by the .landing-* classes in globals.css. Sign in links to the existing /login flow;
 * auth, layout, colours and the button are unchanged.
 */
export function WelcomeHero() {
  return (
    <section className="w-full max-w-3xl text-center">
      <Image
        src="/landing/wordmark.png"
        alt="MOMENTS"
        width={993}
        height={110}
        priority
        className="landing-wordmark"
      />
      <div className="landing-subtitle mt-4 text-muted">
        Photography &amp; Film &middot; Sydney
      </div>

      <h1 className="landing-heading mt-14 text-ink">Welcome to your studio workspace</h1>
      <p className="landing-desc mx-auto mt-5 max-w-2xl text-ink-muted">
        Manage enquiries, projects, bookings, and payments in one place
      </p>

      <div className="mt-10">
        <Link
          href="/login"
          className="landing-btn inline-flex h-12 items-center justify-center rounded-md bg-ink px-8 text-surface outline-none transition-colors duration-150 hover:opacity-90 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 sm:h-14 sm:px-9"
        >
          Sign in
        </Link>
      </div>
    </section>
  )
}
