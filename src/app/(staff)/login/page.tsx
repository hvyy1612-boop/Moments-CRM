import type { Metadata } from 'next'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { Alert } from '@/components/ui/Alert'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { getSessionUser } from '@/lib/auth/guard'
import { LoginForm } from './LoginForm'

export const runtime = 'nodejs'

export const metadata: Metadata = { title: 'Sign in - Moments' }

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reset?: string; registered?: string }>
}) {
  const user = await getSessionUser()
  if (user) redirect('/dashboard')

  const { reset, registered } = await searchParams
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value ?? ''
  const csrf = cookieValue ? csrfFieldValue(cookieValue) : ''

  return (
    <main className="flex min-h-screen items-center justify-center bg-paper px-4 py-12">
      <div className="w-full max-w-sm rounded-xl border border-line bg-surface p-8 shadow-sm">
        <div className="text-center">
          <div className="font-serif text-xl font-semibold uppercase tracking-[0.18em] text-ink">Moments</div>
          <p className="mt-1 text-xs uppercase tracking-[0.2em] text-muted">Photography · Sydney</p>
        </div>
        <h1 className="mt-6 text-2xl">Sign in</h1>
        <div className="mt-6 flex flex-col gap-5">
          {reset === 'done' ? (
            <Alert tone="success" title="Your password has been updated">
              Sign in with your new password.
            </Alert>
          ) : null}
          {registered === '1' ? (
            <Alert tone="success" title="Account created">
              An admin will approve it before you can sign in.
            </Alert>
          ) : null}
          <LoginForm csrf={csrf} />
          <div className="flex items-center justify-between gap-4">
            <Link href="/forgot" className="text-sm font-bold text-accent-ink hover:underline">
              Forgot your password?
            </Link>
            <Link href="/register" className="text-sm font-bold text-accent-ink hover:underline">
              Create an account
            </Link>
          </div>
        </div>
      </div>
    </main>
  )
}
