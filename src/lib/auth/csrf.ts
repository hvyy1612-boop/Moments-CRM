import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * CSRF protection for state-changing form posts (SEC-A04), double-submit style.
 *
 * The middleware mints an httpOnly random cookie. Pages render a hidden field carrying an HMAC of
 * that cookie value, and every action verifies field against cookie before doing anything. Next.js
 * server actions additionally enforce a same-origin check; this layer makes the control explicit
 * and testable, as the brief requires.
 *
 * The HMAC key is SESSION_SECRET, which env.ts requires in production (SEC-A08). Development and
 * test may run without it, so a FIXED development key is used there. It must be fixed, not random:
 * Next.js loads server modules more than once (the page layer and the server-action layer are
 * separate instances), so a per-process random key would make the page mint a field the action
 * cannot verify, and every form would fail. This key is not a secret and never applies in
 * production. Read from process.env directly so unit tests need no database configuration.
 */
export const CSRF_COOKIE = 'moments_csrf'
export const CSRF_FIELD = 'csrf'

const DEV_FALLBACK_KEY = 'development-only-csrf-key-never-used-in-production'
const secret = process.env.SESSION_SECRET ?? DEV_FALLBACK_KEY

/** The hidden-field value for a given CSRF cookie value. */
export function csrfFieldValue(cookieValue: string): string {
  return createHmac('sha256', secret).update(cookieValue).digest('hex')
}

/** Constant-time check of the posted field against the cookie. False on anything malformed. */
export function verifyCsrf(cookieValue: string | undefined, fieldValue: unknown): boolean {
  if (!cookieValue || typeof fieldValue !== 'string' || fieldValue.length === 0) return false
  const expected = Buffer.from(csrfFieldValue(cookieValue), 'hex')
  const provided = Buffer.from(fieldValue, 'hex')
  if (provided.length !== expected.length) return false
  return timingSafeEqual(expected, provided)
}
