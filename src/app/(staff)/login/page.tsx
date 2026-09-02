import type { Metadata } from 'next'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { AuthCard } from '@/components/auth/AuthCard'
import { AuthDivider } from '@/components/auth/AuthDivider'
import { GoogleButton } from '@/components/auth/GoogleButton'
import { Alert } from '@/components/ui/Alert'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { getSessionUser } from '@/lib/auth/guard'
import { googleEnabled } from '@/lib/env'
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
    <AuthCard heading="Sign in">
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

      {googleEnabled ? (
        <>
          <AuthDivider />
          <GoogleButton />
        </>
      ) : null}

      <div className="flex items-center justify-between gap-4">
        <Link href="/forgot" className="text-sm font-bold text-accent-ink hover:underline">
          Forgot your password?
        </Link>
        <Link href="/register" className="text-sm font-bold text-accent-ink hover:underline">
          Create an account
        </Link>
      </div>
    </AuthCard>
  )
}
