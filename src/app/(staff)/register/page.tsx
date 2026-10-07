import type { Metadata } from 'next'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { Alert } from '@/components/ui/Alert'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { getSessionUser } from '@/lib/auth/guard'
import { signupOptions } from '@/lib/auth/register'
import { RegisterForm } from './RegisterForm'

export const runtime = 'nodejs'
export const metadata: Metadata = { title: 'Create an account - Moments' }

/** Staff sign-up (for trying the system). Admins can close it on the Users page. */
export default async function RegisterPage() {
  if (await getSessionUser()) redirect('/dashboard')
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value ?? ''
  const csrf = cookieValue ? csrfFieldValue(cookieValue) : ''
  const { open, roles } = await signupOptions()

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <p className="text-sm text-ink-muted">Moments Photography and Film</p>
        <h1 className="mt-1 text-2xl">Create an account</h1>
        {open ? (
          <>
            <p className="mt-2 text-base text-ink-muted">Choose your role and a password. We will give you a login ID and recovery codes.</p>
            <RegisterForm csrf={csrf} roles={roles} />
          </>
        ) : (
          <div className="mt-6 flex flex-col gap-5">
            <Alert tone="info" title="Sign-up is closed">
              Please ask your admin to create an account for you.
            </Alert>
            <Link href="/login" className="text-sm font-bold text-accent-ink hover:underline">
              Back to sign in
            </Link>
          </div>
        )}
      </div>
    </main>
  )
}
