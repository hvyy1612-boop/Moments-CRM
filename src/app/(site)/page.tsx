import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth/guard'
import { WelcomeHero } from '@/features/landing/components/WelcomeHero'

export const runtime = 'nodejs'

export const metadata: Metadata = { title: 'Moments - Studio workspace' }

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
