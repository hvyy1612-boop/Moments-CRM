import type { Metadata } from 'next'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Field, TextInput } from '@/components/ui/form'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { requestResetAction } from './actions'

export const runtime = 'nodejs'
export const metadata: Metadata = { title: 'Reset password - Moments' }

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string }>
}) {
  const { sent } = await searchParams
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value ?? ''
  const csrf = cookieValue ? csrfFieldValue(cookieValue) : ''

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <p className="text-sm text-ink-muted">Moments Photography and Film</p>
        <h1 className="mt-1 text-2xl">Reset your password</h1>

        {sent ? (
          <div className="mt-6 flex flex-col gap-5">
            <Alert tone="success" title="Check your email">
              If an account exists for that address, we have sent a link to reset the password. The
              link expires in 60 minutes.
            </Alert>
            <Link href="/login" className="text-sm font-bold text-accent-ink hover:underline">
              Back to sign in
            </Link>
          </div>
        ) : (
          <>
            <p className="mt-2 text-base text-ink-muted">
              Enter your email and we will send a link to set a new password.
            </p>
            <form action={requestResetAction} className="mt-6 flex flex-col gap-5">
              <input type="hidden" name="csrf" value={csrf} />
              <Field label="Email" htmlFor="email">
                <TextInput id="email" name="email" type="email" autoComplete="email" autoFocus required />
              </Field>
              <Button type="submit" className="w-full">
                Send reset link
              </Button>
              <Link href="/login" className="text-sm font-bold text-accent-ink hover:underline">
                Back to sign in
              </Link>
            </form>
          </>
        )}
      </div>
    </main>
  )
}
