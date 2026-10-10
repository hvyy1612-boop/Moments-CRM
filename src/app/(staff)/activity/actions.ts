'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getActionUser } from '@/lib/auth/guard'
import { verifyUserPasswordWithLockout } from '@/lib/auth/reauth'
import { CSRF_COOKIE, verifyCsrf } from '@/lib/auth/csrf'
import { STEPUP_COOKIE, STEPUP_TTL_MS, issueStepUp } from '@/lib/auth/stepup'
import {
  clearActivityPin,
  getActivityPinStatus,
  isValidPinFormat,
  isWeakPin,
  logActivityPinEvent,
  setActivityPin,
  verifyActivityPin,
} from '@/lib/auth/activity-pin'

export type StepUpState = { status: 'idle' | 'error'; message?: string }

const ERR = (message: string): StepUpState => ({ status: 'error', message })

async function grantAccess(userId: string): Promise<never> {
  const store = await cookies()
  const expiresAt = Date.now() + STEPUP_TTL_MS
  store.set(STEPUP_COOKIE, issueStepUp(userId, expiresAt), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/activity',
    expires: new Date(expiresAt),
  })
  redirect('/activity')
}

async function safeLog(userId: string, action: Parameters<typeof logActivityPinEvent>[1]) {
  try {
    await logActivityPinEvent(userId, action)
  } catch {
    /* the audit trail is best-effort here; never keep an admin out over a logging hiccup */
  }
}

function minutesUntil(when: Date): number {
  return Math.max(1, Math.ceil((when.getTime() - Date.now()) / 60000))
}

export async function confirmActivityAccessAction(_prev: StepUpState, formData: FormData): Promise<StepUpState> {
  const user = await getActionUser()
  if (!user) return ERR('Your session has expired. Please sign in again.')
  if (user.role !== 'ADMIN') return ERR('Only an admin can open the activity log.')

  const store = await cookies()
  if (!verifyCsrf(store.get(CSRF_COOKIE)?.value, formData.get('csrf'))) {
    return ERR('Your session expired. Please refresh and try again.')
  }

  const mode = String(formData.get('mode') ?? 'pin')

  if (mode === 'password') {
    const password = String(formData.get('password') ?? '')
    if (!password) return ERR('Please enter your account password.')

    const verdict = await verifyUserPasswordWithLockout(user.id, password)
    if (verdict === 'locked') return ERR('Too many wrong attempts. Please wait 5 minutes and try again.')
    if (verdict === 'wrong') {
      await safeLog(user.id, 'auth.activity_password_failed')
      return ERR('That password is not correct. Please try again.')
    }

    if (String(formData.get('intent') ?? 'unlock') === 'reset') {
      await clearActivityPin(user.id)
      await safeLog(user.id, 'auth.activity_pin_reset')
      redirect('/activity')
    }
    await safeLog(user.id, 'auth.activity_password_unlock')
    return grantAccess(user.id)
  }

  if (mode === 'create') {

    if ((await getActivityPinStatus(user.id)).isSet) return ERR('A PIN is already set. Enter your PIN, or use your password to reset it.')
    const pin = String(formData.get('pin') ?? '')
    const confirm = String(formData.get('pinConfirm') ?? '')
    if (!isValidPinFormat(pin)) return ERR('Your PIN must be exactly 4 digits.')
    if (isWeakPin(pin)) return ERR('Please choose a less predictable PIN (avoid 1234 or repeated digits).')
    if (pin !== confirm) return ERR('The two PINs do not match. Please re-enter them.')

    await setActivityPin(user.id, pin)
    await safeLog(user.id, 'auth.activity_pin_set')
    return grantAccess(user.id)
  }

  const pin = String(formData.get('pin') ?? '')
  if (!isValidPinFormat(pin)) return ERR('Please enter your 4-digit PIN.')

  const result = await verifyActivityPin(user.id, pin)
  if (result.ok) return grantAccess(user.id)

  switch (result.reason) {
    case 'not_set':
      return ERR('No PIN is set yet. Please create one below.')
    case 'locked':
      return ERR(`Too many attempts. Please try again in about ${minutesUntil(result.lockedUntil)} minute(s), or use your password.`)
    case 'wrong':
      return ERR(
        result.attemptsLeft <= 2
          ? `That PIN is not correct. ${result.attemptsLeft} attempt(s) left before a short lockout.`
          : 'That PIN is not correct. Please try again.',
      )
  }
}
