'use server'

import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { CSRF_COOKIE, verifyCsrf } from '@/lib/auth/csrf'
import { getSessionUser } from '@/lib/auth/guard'
import { checkPasswordPolicy } from '@/lib/auth/password'
import { verifyUserPasswordWithLockout } from '@/lib/auth/reauth'
import { revokeAllSessions, SESSION_COOKIE, validateSession } from '@/lib/auth/session'
import { setOwnPassword } from '@/lib/auth/user-password'
import { issueRecoveryCodes } from '@/lib/auth/recovery-codes'
import { formatSydneyDateTime, systemClock } from '@/lib/time'

export type ChangePasswordState =
  | { status: 'idle' }
  | { status: 'error'; message?: string; errors?: { current?: string; password?: string; confirm?: string } }
  | { status: 'codes'; loginId: string; codes: string[]; createdLabel: string }

async function requestMeta() {
  const h = await headers()
  return { ipAddress: h.get('x-forwarded-for')?.split(',')[0]?.trim() || '0.0.0.0', userAgent: h.get('user-agent') }
}

async function freshCodes(user: { id: string; email: string }): Promise<ChangePasswordState> {
  const codes = await issueRecoveryCodes(user.id, await requestMeta())
  return { status: 'codes', loginId: user.email, codes, createdLabel: formatSydneyDateTime(systemClock.now()) }
}

export async function changePassword(
  _prev: ChangePasswordState,
  formData: FormData,
): Promise<ChangePasswordState> {
  const cookieStore = await cookies()
  if (!verifyCsrf(cookieStore.get(CSRF_COOKIE)?.value, formData.get('csrf'))) {
    return { status: 'error', message: 'Your session expired. Refresh and try again.' }
  }

  const user = await getSessionUser()
  if (!user) redirect('/login')

  if (!user.mustChangePassword) {
    const verdict = await verifyUserPasswordWithLockout(user.id, String(formData.get('currentPassword') ?? ''))
    if (verdict === 'locked') return { status: 'error', message: 'Too many wrong attempts. Please wait 5 minutes and try again.' }
    if (verdict === 'wrong') return { status: 'error', errors: { current: 'Your current password is not correct.' } }
  }

  const password = String(formData.get('password') ?? '')
  const confirm = String(formData.get('confirm') ?? '')

  const policy = checkPasswordPolicy(password)
  if (policy === 'too_common') {
    return { status: 'error', errors: { password: 'That password is too common. Choose something less predictable.' } }
  }
  if (policy) {
    return { status: 'error', errors: { password: 'Your password does not meet all the requirements listed below.' } }
  }
  if (password !== confirm) {
    return { status: 'error', errors: { confirm: 'The two passwords do not match.' } }
  }

  await setOwnPassword(user.id, password)

  const token = cookieStore.get(SESSION_COOKIE)?.value
  const current = token ? await validateSession(token) : null
  await revokeAllSessions(user.id, { exceptSessionId: current?.sessionId })

  if (user.mustChangePassword) return freshCodes(user)
  redirect('/dashboard')
}

export type RecoveryCodesState = { status: 'idle' } | { status: 'error'; message: string } | Extract<ChangePasswordState, { status: 'codes' }>

export async function createRecoveryCodesAction(_prev: RecoveryCodesState, formData: FormData): Promise<RecoveryCodesState> {
  const cookieStore = await cookies()
  if (!verifyCsrf(cookieStore.get(CSRF_COOKIE)?.value, formData.get('csrf'))) {
    return { status: 'error', message: 'Your session expired. Refresh and try again.' }
  }
  const user = await getSessionUser()
  if (!user) redirect('/login')
  if (user.mustChangePassword) redirect('/change-password')
  const verdict = await verifyUserPasswordWithLockout(user.id, String(formData.get('currentPassword') ?? ''))
  if (verdict === 'locked') return { status: 'error', message: 'Too many wrong attempts. Please wait 5 minutes and try again.' }
  if (verdict === 'wrong') return { status: 'error', message: 'Your current password is not correct.' }
  const result = await freshCodes(user)
  return result.status === 'codes' ? result : { status: 'error', message: 'Could not create recovery codes. Please try again.' }
}
