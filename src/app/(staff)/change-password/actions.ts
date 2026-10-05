'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { CSRF_COOKIE, verifyCsrf } from '@/lib/auth/csrf'
import { getSessionUser } from '@/lib/auth/guard'
import { checkPasswordPolicy } from '@/lib/auth/password'
import { verifyUserPasswordWithLockout } from '@/lib/auth/reauth'
import { revokeAllSessions, SESSION_COOKIE, validateSession } from '@/lib/auth/session'
import { setOwnPassword } from '@/lib/auth/user-password'

export type ChangePasswordState =
  | { status: 'idle' }
  | { status: 'error'; message?: string; errors?: { current?: string; password?: string; confirm?: string } }

/** Set the signed-in staff member's own password and clear the forced-change flag. */
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

  // A voluntary change must prove the current password (a session left open must not be enough to take
  // the account over). The forced first-login change skips it: they just signed in with the temp password.
  if (!user.mustChangePassword) {
    const verdict = await verifyUserPasswordWithLockout(user.id, String(formData.get('currentPassword') ?? ''))
    if (verdict === 'locked') return { status: 'error', message: 'Too many wrong attempts. Please wait 15 minutes and try again.' }
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
  // SEC-P06: a password change signs out every OTHER session (e.g. a stolen cookie); this one stays.
  const token = cookieStore.get(SESSION_COOKIE)?.value
  const current = token ? await validateSession(token) : null
  await revokeAllSessions(user.id, { exceptSessionId: current?.sessionId })
  redirect('/dashboard')
}
