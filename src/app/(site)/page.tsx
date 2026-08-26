import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth/guard'
import { WelcomeHero } from '@/features/landing/components/WelcomeHero'
import { WorkspaceHighlights } from '@/features/landing/components/WorkspaceHighlights'

// Reads the session (Node runtime for the session/crypto libs, matching the other auth-aware pages).
export const runtime = 'nodejs'

export const metadata: Metadata = { title: 'Moments - Studio workspace' }

/** The landing / sign-in gateway. Already-signed-in staff skip straight to the dashboard. */
export default async function LandingPage() {
  const user = await getSessionUser()
  if (user) redirect('/dashboard')

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col items-center justify-center px-4 py-12">
      <WelcomeHero />
      <WorkspaceHighlights />
    </main>
  )
}
