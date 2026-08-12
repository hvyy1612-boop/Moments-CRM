import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { ForgotPasswordForm } from './ForgotPasswordForm'

export const runtime = 'nodejs'

export const metadata: Metadata = { title: 'Forgot password — Moments' }

export default async function ForgotPasswordPage() {
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value ?? ''
  const csrf = cookieValue ? csrfFieldValue(cookieValue) : ''

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <p className="text-sm text-ink-muted">Moments Photography and Film</p>
        <h1 className="mt-1 text-2xl">Forgot password</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Enter your account email. If it matches an account, a reset link will be sent. The link
          works once and expires in 15 minutes.
        </p>
        <div className="mt-6">
          <ForgotPasswordForm csrf={csrf} />
        </div>
      </div>
    </main>
  )
}
