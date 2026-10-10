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

export default async function ChangePasswordPage() {
  const user = await getSessionUser()
  if (!user) redirect('/login')
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value ?? ''
  const csrf = cookieValue ? csrfFieldValue(cookieValue) : ''

  const forced = user.mustChangePassword
  const codesLeft = forced ? 0 : await recoveryCodesLeft(user.id)

  return (
    <AuthCard>
      <ChangePasswordForm csrf={csrf} requireCurrent={!forced} />
      {forced ? null : <RecoveryCodesSection csrf={csrf} codesLeft={codesLeft} />}
    </AuthCard>
  )
}
