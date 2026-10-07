import type { Metadata } from 'next'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Field, TextInput } from '@/components/ui/form'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { isResetTokenValid } from '@/lib/auth/password-reset'
import { resetPasswordAction } from './actions'

export const runtime = 'nodejs'
export const metadata: Metadata = { title: 'Set a new password - Moments' }

const ERROR_MESSAGE: Record<string, string> = {
  invalid: 'This reset link is invalid or has expired. Ask your admin for a new one, or use a recovery code.',
  weak: 'Use at least 8 characters with a letter, a number, and a special character.',
  too_common: 'That password is too common. Choose something less predictable.',
}

export default async function ResetPasswordPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ error?: string }>
}) {
  const { token } = await params
  const { error } = await searchParams
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value ?? ''
  const csrf = cookieValue ? csrfFieldValue(cookieValue) : ''

  const valid = await isResetTokenValid(token)

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <p className="text-sm text-ink-muted">Moments Photography and Film</p>
        <h1 className="mt-1 text-2xl">Set a new password</h1>

        {!valid ? (
          <div className="mt-6 flex flex-col gap-5">
            <Alert tone="danger" title="This link is invalid or has expired">
              Reset links last 60 minutes and can be used once. Ask your admin for a new one, or use a recovery code.
            </Alert>
            <Link href="/forgot" className="text-sm font-bold text-accent-ink hover:underline">
              Use a recovery code
            </Link>
          </div>
        ) : (
          <form action={resetPasswordAction} className="mt-6 flex flex-col gap-5">
            {error ? (
              <Alert tone="danger" title={ERROR_MESSAGE[error] ?? 'This reset link is invalid or has expired.'} />
            ) : null}
            <input type="hidden" name="csrf" value={csrf} />
            <input type="hidden" name="token" value={token} />
            <Field label="New password" htmlFor="password" hint="At least 8 characters, with a letter, a number, and a special character.">
              <TextInput
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                autoFocus
                required
                minLength={8}
              />
            </Field>
            <Button type="submit" className="w-full">
              Update password
            </Button>
            <Link href="/login" className="text-sm font-bold text-accent-ink hover:underline">
              Back to sign in
            </Link>
          </form>
        )}
      </div>
    </main>
  )
}
