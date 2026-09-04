import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { AuthCard } from '@/components/auth/AuthCard'
import { Alert } from '@/components/ui/Alert'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { getSessionUser } from '@/lib/auth/guard'
import { LoginForm } from './LoginForm'

// Auth pages pin the Node runtime for @node-rs/argon2 and node:crypto (D-006).
export const runtime = 'nodejs'

export const metadata: Metadata = { title: 'Sign in - Moments' }

/**
 * Staff sign-in. Accounts are provisioned by an admin (no public sign-up); staff sign in with their
 * Staff ID + password. Google OAuth routes still exist but are intentionally not surfaced here.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reset?: string; error?: string }>
}) {
  const user = await getSessionUser()
  if (user) redirect('/dashboard')

  const { reset, error } = await searchParams
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value ?? ''
  const csrf = cookieValue ? csrfFieldValue(cookieValue) : ''

  return (
    <AuthCard heading="Access your workspace">
      {reset === 'done' ? (
        <Alert tone="success" title="Your password has been updated">Sign in with your new password.</Alert>
      ) : null}
      {error === 'google' ? (
        <Alert tone="danger" title="Couldn’t sign in with Google">Please sign in with your Staff ID and password.</Alert>
      ) : null}

      <LoginForm csrf={csrf} />
    </AuthCard>
  )
}
