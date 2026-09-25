import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Step-up (re-authentication) for sensitive admin pages - OWASP "re-authentication for sensitive
 * operations". An admin must re-enter their password to open a protected page even though they are
 * already signed in; a short-lived signed cookie then lets them stay in for a few minutes, so an
 * unattended-but-logged-in session does not expose the page to whoever walks up to the screen.
 *
 * The cookie is an HMAC over `${userId}.${expiresAt}` keyed by SESSION_SECRET (same key strategy as
 * CSRF): it cannot be forged or replayed for another user, and it expires on its own.
 */
export const STEPUP_COOKIE = 'moments_stepup_activity'
export const STEPUP_TTL_MS = 10 * 60 * 1000 // 10 minutes of confirmed access

const DEV_FALLBACK_KEY = 'development-only-csrf-key-never-used-in-production'
const secret = process.env.SESSION_SECRET ?? DEV_FALLBACK_KEY

function sign(payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex')
}

/** Cookie value granting step-up access to `userId` until `expiresAt` (epoch ms). */
export function issueStepUp(userId: string, expiresAt: number): string {
  const payload = `${userId}.${expiresAt}`
  return `${payload}.${sign(payload)}`
}

/** True when `cookieValue` is a valid, unexpired step-up token for `userId` (constant-time signature check). */
export function hasStepUp(cookieValue: string | undefined, userId: string, now: number = Date.now()): boolean {
  if (!cookieValue) return false
  const parts = cookieValue.split('.')
  if (parts.length !== 3) return false
  const [uid, expStr, sig] = parts
  if (uid !== userId) return false
  const exp = Number.parseInt(expStr ?? '', 10)
  if (!Number.isFinite(exp) || exp < now) return false
  const expected = Buffer.from(sign(`${uid}.${expStr}`), 'hex')
  const provided = Buffer.from(sig ?? '', 'hex')
  if (provided.length !== expected.length) return false
  return timingSafeEqual(expected, provided)
}
