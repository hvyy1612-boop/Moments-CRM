import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { RecoverPasswordForm } from './RecoverPasswordForm'

export const runtime = 'nodejs'
export const metadata: Metadata = { title: 'Reset password - Moments' }

/** Forgot password: login ID + one saved recovery code + a new password. */
export default async function ForgotPasswordPage() {
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value ?? ''
  const csrf = cookieValue ? csrfFieldValue(cookieValue) : ''

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <p className="text-sm text-ink-muted">Moments Photography and Film</p>
        <h1 className="mt-1 text-2xl">Reset your password</h1>
        <p className="mt-2 text-base text-ink-muted">
          Enter your login ID and one of the recovery codes you saved when you set your password.
        </p>
        <p className="mt-2 text-sm text-ink-muted">No codes left, or forgot your login ID? Ask your admin to reset your password.</p>
        <RecoverPasswordForm csrf={csrf} />
      </div>
    </main>
  )
}
