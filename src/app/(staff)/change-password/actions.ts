'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { CSRF_COOKIE, verifyCsrf } from '@/lib/auth/csrf'
import { getSessionUser } from '@/lib/auth/guard'
import { checkPasswordPolicy } from '@/lib/auth/password'
import { setOwnPassword } from '@/lib/auth/user-password'

export type ChangePasswordState =
  | { status: 'idle' }
  | { status: 'error'; message?: string; errors?: { password?: string; confirm?: string } }

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
  redirect('/dashboard')
}
