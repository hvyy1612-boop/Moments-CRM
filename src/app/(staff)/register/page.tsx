import type { Metadata } from 'next'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { AuthCard } from '@/components/auth/AuthCard'
import { AuthDivider } from '@/components/auth/AuthDivider'
import { GoogleButton } from '@/components/auth/GoogleButton'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { getSessionUser } from '@/lib/auth/guard'
import { googleEnabled } from '@/lib/env'
import { RegisterForm } from './RegisterForm'

export const runtime = 'nodejs'
export const metadata: Metadata = { title: 'Create account - Moments' }

export default async function RegisterPage() {
  const user = await getSessionUser()
  if (user) redirect('/dashboard')

  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value ?? ''
  const csrf = cookieValue ? csrfFieldValue(cookieValue) : ''

  return (
    <AuthCard heading="Create your account" subtitle="An admin approves new accounts before you can sign in.">
      <RegisterForm csrf={csrf} />

      {googleEnabled ? (
        <>
          <AuthDivider />
          <GoogleButton label="Sign up with Google" />
        </>
      ) : null}

      <Link href="/login" className="text-center text-sm font-bold text-accent-ink hover:underline">
        Already have an account? Sign in
      </Link>
    </AuthCard>
  )
}
