import type { Metadata } from 'next'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { getSessionUser } from '@/lib/auth/guard'
import { RegisterForm } from './RegisterForm'

export const runtime = 'nodejs'
export const metadata: Metadata = { title: 'Create account - Moments' }

/**
 * Self-service staff registration. New accounts are created inactive and need an admin to approve
 * them before they can sign in (the studio chose "anyone can register, admin approves").
 */
export default async function RegisterPage() {
  const user = await getSessionUser()
  if (user) redirect('/dashboard')

  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value ?? ''
  const csrf = cookieValue ? csrfFieldValue(cookieValue) : ''

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <p className="text-sm text-ink-muted">Moments Photography and Film</p>
        <h1 className="mt-1 text-2xl">Create an account</h1>
        <p className="mt-2 text-sm text-ink-muted">
          An admin approves new accounts before you can sign in.
        </p>
        <div className="mt-6 flex flex-col gap-5">
          <RegisterForm csrf={csrf} />
          <Link href="/login" className="text-sm font-bold text-accent-ink hover:underline">
            Already have an account? Sign in
          </Link>
        </div>
      </div>
    </main>
  )
}
