import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { AuthCard } from '@/components/auth/AuthCard'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { requireRole } from '@/lib/auth/guard'
import { OnboardingForm } from './OnboardingForm'

// Auth pages pin the Node runtime for the session/crypto libs (D-006).
export const runtime = 'nodejs'

export const metadata: Metadata = { title: 'Set up your profile - Moments' }

/**
 * First-run profile step for a freshly signed-in staff member (reached straight after Google sign-in
 * creates their account). They confirm/enter their display name, then continue to the dashboard.
 * No admin approval - access itself is gated by the Google Test users list (see the OAuth callback).
 */
export default async function OnboardingPage() {
  const user = await requireRole('/onboarding')
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value ?? ''
  const csrf = cookieValue ? csrfFieldValue(cookieValue) : ''

  return (
    <AuthCard heading="Set up your profile" subtitle="One quick thing before you start.">
      <OnboardingForm csrf={csrf} defaultName={user.name} />
    </AuthCard>
  )
}
