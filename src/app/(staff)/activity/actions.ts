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

/** Grant the short-lived step-up so the Activity page opens, then reload it. */
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

/** Audit-log a step-up event without ever blocking access if the write fails. */
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

/**
 * Open the Activity page by step-up. One action, three modes so the gate can switch views without
 * juggling several endpoints:
 *  - create:   first-time admin sets a 4-digit PIN (with confirmation).
 *  - pin:      returning admin enters their PIN (rate-limited, locks after repeated misses).
 *  - password: fallback for a forgotten/locked PIN. "unlock" opens the page; "reset" clears the PIN so
 *              a fresh one is set next. Either way the account password is verified first.
 * On success it sets the signed step-up cookie and reloads; on failure it returns a friendly message.
 */
export async function confirmActivityAccessAction(_prev: StepUpState, formData: FormData): Promise<StepUpState> {
  const user = await getActionUser()
  if (!user) return ERR('Your session has expired. Please sign in again.')
  if (user.role !== 'ADMIN') return ERR('Only an admin can open the activity log.')

  const store = await cookies()
  if (!verifyCsrf(store.get(CSRF_COOKIE)?.value, formData.get('csrf'))) {
    return ERR('Your session expired. Please refresh and try again.')
  }

  const mode = String(formData.get('mode') ?? 'pin')

  // ---- Password fallback (forgotten or locked-out PIN) ----------------------------------------
  if (mode === 'password') {
    const password = String(formData.get('password') ?? '')
    if (!password) return ERR('Please enter your account password.')
    // Same lockout budget as sign-in, and every miss is on the audit trail (it bypasses the PIN lock).
    const verdict = await verifyUserPasswordWithLockout(user.id, password)
    if (verdict === 'locked') return ERR('Too many wrong attempts. Please wait 5 minutes and try again.')
    if (verdict === 'wrong') {
      await safeLog(user.id, 'auth.activity_password_failed')
      return ERR('That password is not correct. Please try again.')
    }

    if (String(formData.get('intent') ?? 'unlock') === 'reset') {
      await clearActivityPin(user.id)
      await safeLog(user.id, 'auth.activity_pin_reset')
      redirect('/activity') // no step-up: the page will now show "set a new PIN"
    }
    await safeLog(user.id, 'auth.activity_password_unlock')
    return grantAccess(user.id)
  }

  // ---- First-time PIN creation ----------------------------------------------------------------
  if (mode === 'create') {
    // Creation is ONLY for an admin with no PIN yet; otherwise the hidden "mode" field could be changed to
    // overwrite an existing PIN and walk straight past the step-up. Changing a PIN goes via the password reset.
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

  // ---- Returning admin enters their PIN -------------------------------------------------------
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
