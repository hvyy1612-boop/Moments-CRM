import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth/guard'
import { WelcomeHero } from '@/features/landing/components/WelcomeHero'

// Reads the session (Node runtime for the session/crypto libs, matching the other auth-aware pages).
export const runtime = 'nodejs'

export const metadata: Metadata = { title: 'Moments - Studio workspace' }

/**
 * The landing / sign-in gateway. Already-signed-in staff skip straight to the dashboard.
 *
 * Two stacked bands: a centred editorial masthead on the warm ground, then one full-bleed wedding
 * photograph filling the lower portion. The photo is served from /public (drop the studio's own image
 * at public/landing/hero.jpg); until then the warm fallback shows, never a broken image.
 */
export default async function LandingPage() {
  const user = await getSessionUser()
  if (user) redirect('/dashboard')

  return (
    <main className="flex min-h-screen flex-col bg-paper">
      <section className="flex flex-1 flex-col items-center justify-center px-6 py-16 sm:py-20">
        <WelcomeHero />
      </section>
      <div
        role="img"
        aria-label="A bride and groom dancing together on their wedding day"
        style={{ backgroundImage: 'url(/landing/hero.jpg)' }}
        className="h-[42vh] w-full bg-sunk bg-cover bg-center sm:h-[52vh]"
      />
    </main>
  )
}
