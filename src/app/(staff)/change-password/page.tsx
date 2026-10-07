import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { AuthCard } from '@/components/auth/AuthCard'
import { CSRF_COOKIE, csrfFieldValue } from '@/lib/auth/csrf'
import { getSessionUser } from '@/lib/auth/guard'
import { recoveryCodesLeft } from '@/lib/auth/recovery-codes'
import { ChangePasswordForm } from './ChangePasswordForm'
import { RecoveryCodesSection } from './RecoveryCodesSection'

export const runtime = 'nodejs'
export const metadata: Metadata = { title: 'Password - Moments' }

/**
 * Password page. Forced first-login change: an admin creates the account with a temporary password and
 * mustChangePassword=true; the guard sends the staff member here until they set their own password, then
 * their recovery codes are shown once. Voluntary visit: change the password, and see / renew recovery codes.
 * Authenticates with getSessionUser (not requireRole) so the forced redirect never loops.
 */
export default async function ChangePasswordPage() {
  const user = await getSessionUser()
  if (!user) redirect('/login')
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value ?? ''
  const csrf = cookieValue ? csrfFieldValue(cookieValue) : ''

  const forced = user.mustChangePassword
  const codesLeft = forced ? 0 : await recoveryCodesLeft(user.id)

  return (
    <AuthCard heading={forced ? 'Set a new password' : 'Password and recovery codes'} subtitle={forced ? 'Choose your own password to finish signing in.' : 'Enter your current password, then choose a new one. Your other signed-in devices will be signed out.'}>
      <ChangePasswordForm csrf={csrf} requireCurrent={!forced} />
      {forced ? null : <RecoveryCodesSection csrf={csrf} codesLeft={codesLeft} />}
    </AuthCard>
  )
}
