import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { AuthCard, AuthTitle } from '@/components/auth/AuthCard'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { RecoverPasswordForm } from './RecoverPasswordForm'

export const runtime = 'nodejs'
export const metadata: Metadata = { title: 'Reset password - Moments' }

/** Forgot password: login ID + one saved recovery code + a new password. */
export default async function ForgotPasswordPage() {
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value ?? ''
  const csrf = cookieValue ? csrfFieldValue(cookieValue) : ''

  return (
    <AuthCard>
      <AuthTitle
        title="Reset your password"
        subtitle="Enter your login ID and one of the recovery codes you saved. No codes left, or forgot your login ID? Ask your admin to reset your password."
      />
      <RecoverPasswordForm csrf={csrf} />
    </AuthCard>
  )
}
