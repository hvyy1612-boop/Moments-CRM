'use server'

import { cookies, headers } from 'next/headers'
import { appBaseUrl } from '@/lib/app-url'
import { can } from '@/lib/auth/authz'
import { CSRF_COOKIE, verifyCsrf } from '@/lib/auth/csrf'
import { getActionUser } from '@/lib/auth/guard'
import { requestPasswordReset } from '@/lib/auth/password-reset'

export type ResetLinkState =
  | { status: 'idle' }
  | { status: 'link'; email: string; link: string }
  | { status: 'error'; message: string }

async function clientIp(): Promise<string> {
  const h = await headers()
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() || '0.0.0.0'
}

/**
 * Admin-only, temporary reset path while no mail provider is wired: generate a one-time reset link
 * for a staff member and show it to the admin to hand over out-of-band. Uses the same secure token
 * (single-use, 60-minute, hashed in the DB) as the self-service flow.
 */
export async function generateResetLinkAction(
  _prev: ResetLinkState,
  formData: FormData,
): Promise<ResetLinkState> {
  const user = await getActionUser()
  if (!can(user, 'USER_MANAGE')) return { status: 'error', message: 'You do not have permission to do this.' }

  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value
  if (!verifyCsrf(cookieValue, formData.get('csrf'))) {
    return { status: 'error', message: 'Invalid request. Refresh the page and try again.' }
  }

  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  if (!email) return { status: 'error', message: 'Enter the staff member’s email.' }

  const result = await requestPasswordReset(email, await clientIp())
  if (!result) return { status: 'error', message: 'No link was made. Check the email belongs to an active staff member, or wait an hour if several links were made for them already.' }

  return { status: 'link', email, link: `${await appBaseUrl()}/reset/${result.token}` }
}
