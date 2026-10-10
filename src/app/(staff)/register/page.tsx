import type { Metadata } from 'next'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { AuthCard, AuthTitle } from '@/components/auth/AuthCard'
import { Alert } from '@/components/ui/Alert'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { getSessionUser } from '@/lib/auth/guard'
import { signupOptions } from '@/lib/auth/register'
import { RegisterForm } from './RegisterForm'

export const runtime = 'nodejs'
export const metadata: Metadata = { title: 'Create an account - Moments' }

export default async function RegisterPage() {
  if (await getSessionUser()) redirect('/dashboard')
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value ?? ''
  const csrf = cookieValue ? csrfFieldValue(cookieValue) : ''
  const { open, roles } = await signupOptions()

  return (
    <AuthCard>
      {open ? (
        <RegisterForm csrf={csrf} roles={roles} />
      ) : (
        <>
          <AuthTitle title="Create an account" />
          <div className="flex flex-col gap-5">
            <Alert tone="info" title="Sign-up is closed">
              Please ask your admin to create an account for you.
            </Alert>
            <Link href="/login" className="text-sm font-bold text-accent-ink hover:underline">
              Back to sign in
            </Link>
          </div>
        </>
      )}
    </AuthCard>
  )
}
