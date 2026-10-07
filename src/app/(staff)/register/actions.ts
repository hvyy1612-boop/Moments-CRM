'use server'

import { cookies, headers } from 'next/headers'
import { CSRF_COOKIE, verifyCsrf } from '@/lib/auth/csrf'
import { checkPasswordPolicy } from '@/lib/auth/password'
import type { Role } from '@/lib/auth/permissions'
import { registerAccount } from '@/lib/auth/register'
import { ROLE_LABEL } from '@/lib/auth/teams'
import { formatSydneyDateTime, systemClock } from '@/lib/time'

export type RegisterState =
  | { status: 'idle' }
  | { status: 'error'; message?: string; errors?: { name?: string; role?: string; password?: string; confirm?: string }; values: { name: string; role: string } }
  | { status: 'created'; loginId: string; roleLabel: string; codes: string[]; createdLabel: string }

const ROLES: Role[] = ['ADMIN', 'STUDIO', 'SUPERVISOR']

/** Staff sign-up: the person picks a role and password; the system issues the login ID + recovery codes. */
export async function registerAction(_prev: RegisterState, formData: FormData): Promise<RegisterState> {
  const name = String(formData.get('name') ?? '').trim()
  const role = String(formData.get('role') ?? '')
  const values = { name, role }
  if (!verifyCsrf((await cookies()).get(CSRF_COOKIE)?.value, formData.get('csrf'))) {
    return { status: 'error', message: 'Your session expired. Refresh and try again.', values }
  }
  const password = String(formData.get('password') ?? '')
  const confirm = String(formData.get('confirm') ?? '')

  if (name.length < 2) return { status: 'error', errors: { name: 'Please enter your full name.' }, values }
  if (name.length > 100) return { status: 'error', errors: { name: 'Please keep your name under 100 characters.' }, values }
  if (!ROLES.includes(role as Role)) return { status: 'error', errors: { role: 'Please choose a role.' }, values }
  const policy = checkPasswordPolicy(password)
  if (policy === 'too_common') return { status: 'error', errors: { password: 'That password is too common. Choose something less predictable.' }, values }
  if (policy) return { status: 'error', errors: { password: 'Your password does not meet all the requirements listed below.' }, values }
  if (password !== confirm) return { status: 'error', errors: { confirm: 'The two passwords do not match.' }, values }

  const h = await headers()
  const result = await registerAccount(
    { name, role: role as Role, password },
    { ipAddress: h.get('x-forwarded-for')?.split(',')[0]?.trim() || '0.0.0.0', userAgent: h.get('user-agent') },
  )
  if (!result.ok) {
    const message =
      result.reason === 'closed'
        ? 'Sign-up is closed. Please ask your admin for an account.'
        : result.reason === 'role'
          ? 'That role cannot be chosen here. Please pick Staff or Supervisor.'
          : 'Too many accounts were created from this network. Please try again in an hour.'
    return { status: 'error', message, values }
  }
  return {
    status: 'created',
    loginId: result.loginId,
    roleLabel: ROLE_LABEL[role as Role],
    codes: result.codes,
    createdLabel: formatSydneyDateTime(systemClock.now()),
  }
}
