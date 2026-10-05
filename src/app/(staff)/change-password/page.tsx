import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { AuthCard } from '@/components/auth/AuthCard'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { getSessionUser } from '@/lib/auth/guard'
import { ChangePasswordForm } from './ChangePasswordForm'

export const runtime = 'nodejs'
export const metadata: Metadata = { title: 'Set a new password - Moments' }

/**
 * Forced first-login password change. An admin creates the account with a temporary password and
 * mustChangePassword=true; the guard sends the staff member here until they set their own password.
 * Authenticates with getSessionUser (not requireRole) so the forced redirect never loops.
 */
export default async function ChangePasswordPage() {
  const user = await getSessionUser()
  if (!user) redirect('/login')
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value ?? ''
  const csrf = cookieValue ? csrfFieldValue(cookieValue) : ''

  return (
    <AuthCard heading="Set a new password" subtitle={user.mustChangePassword ? 'Choose your own password to finish signing in.' : 'Enter your current password, then choose a new one. Your other signed-in devices will be signed out.'}>
      <ChangePasswordForm csrf={csrf} requireCurrent={!user.mustChangePassword} />
    </AuthCard>
  )
}
