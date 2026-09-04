import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { AuthCard } from '@/components/auth/AuthCard'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { getSessionUser } from '@/lib/auth/guard'
import { ChangePasswordForm } from './ChangePasswordForm'

export const runtime = 'nodejs'
export const metadata: Metadata = { title: 'Set a new password - Moments' }

export default async function ChangePasswordPage() {
  const user = await getSessionUser()
  if (!user) redirect('/login')
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value ?? ''
  const csrf = cookieValue ? csrfFieldValue(cookieValue) : ''

  return (
    <AuthCard heading="Set a new password" subtitle="Choose your own password to finish signing in.">
      <ChangePasswordForm csrf={csrf} />
    </AuthCard>
  )
}
