'use server'

import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { CSRF_COOKIE, verifyCsrf } from '@/lib/auth/csrf'
import { checkPasswordPolicy } from '@/lib/auth/password'
import { resetPasswordWithRecoveryCode } from '@/lib/auth/recovery-codes'

export type RecoverState =
  | { status: 'idle' }
  | { status: 'error'; message?: string; errors?: { password?: string; confirm?: string }; loginId: string }

const NO_MATCH =
  'That login ID and recovery code do not match, or the code was already used. Check both and try again, or ask your admin to reset your password.'

/**
 * Self-service reset with a recovery code (a staff login ID is not a mailbox, so there is no email link).
 * One generic message for every failure, so the page never reveals which login IDs exist (OWASP).
 */
export async function recoverPasswordAction(_prev: RecoverState, formData: FormData): Promise<RecoverState> {
  const loginId = String(formData.get('loginId') ?? '').trim()
  if (!verifyCsrf((await cookies()).get(CSRF_COOKIE)?.value, formData.get('csrf'))) {
    return { status: 'error', message: 'Your session expired. Refresh and try again.', loginId }
  }
  const code = String(formData.get('code') ?? '')
  const password = String(formData.get('password') ?? '')
  const confirm = String(formData.get('confirm') ?? '')

  if (!loginId || !code.trim()) return { status: 'error', message: 'Please enter your login ID and one recovery code.', loginId }
  const policy = checkPasswordPolicy(password)
  if (policy === 'too_common') return { status: 'error', errors: { password: 'That password is too common. Choose something less predictable.' }, loginId }
  if (policy) return { status: 'error', errors: { password: 'Your password does not meet all the requirements listed below.' }, loginId }
  if (password !== confirm) return { status: 'error', errors: { confirm: 'The two passwords do not match.' }, loginId }

  const h = await headers()
  const result = await resetPasswordWithRecoveryCode(
    { loginId, code, newPassword: password },
    { ipAddress: h.get('x-forwarded-for')?.split(',')[0]?.trim() || '0.0.0.0', userAgent: h.get('user-agent') },
  )
  if (!result.ok) return { status: 'error', message: NO_MATCH, loginId }
  redirect(`/login?reset=done&codes=${result.codesLeft}`)
}
