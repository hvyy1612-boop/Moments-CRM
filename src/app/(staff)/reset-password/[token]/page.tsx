import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { ResetPasswordForm } from './ResetPasswordForm'

export const runtime = 'nodejs'

export const metadata: Metadata = { title: 'Reset password — Moments' }

export default async function ResetPasswordPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value ?? ''
  const csrf = cookieValue ? csrfFieldValue(cookieValue) : ''

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <p className="text-sm text-ink-muted">Moments Photography and Film</p>
        <h1 className="mt-1 text-2xl">Set a new password</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Use at least 12 characters. A long phrase you can remember beats a short scramble.
        </p>
        <div className="mt-6">
          <ResetPasswordForm csrf={csrf} token={token} />
        </div>
      </div>
    </main>
  )
}
