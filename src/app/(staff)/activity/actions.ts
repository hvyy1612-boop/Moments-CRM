'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth/guard'
import { verifyUserPassword } from '@/lib/auth/reauth'
import { CSRF_COOKIE, verifyCsrf } from '@/lib/auth/csrf'
import { STEPUP_COOKIE, STEPUP_TTL_MS, issueStepUp } from '@/lib/auth/stepup'

export type StepUpState = { status: 'idle' | 'error'; message?: string }

/**
 * Re-authenticate to open the Activity page. Verifies the CURRENT user's password (Argon2id) and, on
 * success, sets a short-lived signed step-up cookie, then reloads the page (which now shows the content).
 * On failure it returns an error and the gate stays shut.
 */
export async function confirmActivityAccessAction(_prev: StepUpState, formData: FormData): Promise<StepUpState> {
  const user = await getSessionUser()
  if (!user) return { status: 'error', message: 'Your session has expired. Please sign in again.' }

  const store = await cookies()
  if (!verifyCsrf(store.get(CSRF_COOKIE)?.value, formData.get('csrf'))) {
    return { status: 'error', message: 'Your session expired. Refresh and try again.' }
  }

  const password = String(formData.get('password') ?? '')
  if (!password) return { status: 'error', message: 'Please enter your password.' }

  const ok = await verifyUserPassword(user.id, password)
  if (!ok) return { status: 'error', message: 'Incorrect password. Please try again.' }

  const expiresAt = Date.now() + STEPUP_TTL_MS
  store.set(STEPUP_COOKIE, issueStepUp(user.id, expiresAt), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/activity',
    expires: new Date(expiresAt),
  })

  redirect('/activity')
}
