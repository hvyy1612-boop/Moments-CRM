'use server'

import { cookies, headers } from 'next/headers'
import { CSRF_COOKIE, verifyCsrf } from '@/lib/auth/csrf'
import { getSessionUser } from '@/lib/auth/guard'
import { requestPasswordReset } from '@/lib/auth/password-reset'

export type ResetLinkState =
  | { status: 'idle' }
  | { status: 'link'; email: string; link: string }
  | { status: 'error'; message: string }

async function requestOrigin(): Promise<string> {
  const h = await headers()
  const proto = h.get('x-forwarded-proto') ?? 'https'
  return `${proto}://${h.get('host') ?? 'localhost:3000'}`
}

async function clientIp(): Promise<string> {
  const h = await headers()
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() || '0.0.0.0'
}

export async function generateResetLinkAction(
  _prev: ResetLinkState,
  formData: FormData,
): Promise<ResetLinkState> {
  const user = await getSessionUser()
  if (!user || user.role !== 'ADMIN') return { status: 'error', message: 'Admins only.' }

  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value
  if (!verifyCsrf(cookieValue, formData.get('csrf'))) {
    return { status: 'error', message: 'Invalid request. Refresh the page and try again.' }
  }

  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  if (!email) return { status: 'error', message: 'Enter the staff member’s email.' }

  const result = await requestPasswordReset(email, await clientIp())
  if (!result) return { status: 'error', message: 'No active account found for that email.' }

  return { status: 'link', email, link: `${await requestOrigin()}/reset/${result.token}` }
}
