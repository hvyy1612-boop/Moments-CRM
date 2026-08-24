import type { Metadata } from 'next'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { Alert } from '@/components/ui/Alert'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { getSessionUser } from '@/lib/auth/guard'
import { LoginForm } from './LoginForm'

// Auth pages pin the Node runtime for @node-rs/argon2 and node:crypto (D-006).
export const runtime = 'nodejs'

export const metadata: Metadata = { title: 'Sign in — Moments' }

/**
 * The staff sign-in page, §8.5: a single centred column in the mandated order. The studio name is
 * text, the heading is "Sign in", and there is no sign-up link — staff accounts are created by an
 * admin invitation only. The Google button and OR divider render only when the Google environment
 * pair is present (BR-G11); that flow arrives with the BR-G work and nothing renders until then.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reset?: string }>
}) {
  const user = await getSessionUser()
  if (user) redirect('/dashboard')

  const { reset } = await searchParams
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value ?? ''
  const csrf = cookieValue ? csrfFieldValue(cookieValue) : ''

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <p className="text-sm text-ink-muted">Moments Photography and Film</p>
        <h1 className="mt-1 text-2xl">Sign in</h1>
        <div className="mt-6 flex flex-col gap-5">
          {reset === 'done' ? (
            <Alert tone="success" title="Your password has been updated">
              Sign in with your new password.
            </Alert>
          ) : null}
          <LoginForm csrf={csrf} />
          <Link href="/forgot" className="text-sm font-bold text-accent-ink hover:underline">
            Forgot your password?
          </Link>
        </div>
      </div>
    </main>
  )
}
