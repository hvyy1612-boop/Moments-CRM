import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * CSRF protection for state-changing form posts (SEC-A04), double-submit style.
 *
 * The middleware mints an httpOnly random cookie. Pages render a hidden field carrying an HMAC of
 * that cookie value, and every action verifies field against cookie before doing anything. Next.js
 * server actions additionally enforce a same-origin check; this layer makes the control explicit
 * and testable, as the brief requires.
 *
 * The HMAC key is SESSION_SECRET (validated at boot in production, SEC-A08). In development and
 * test, where env.ts allows it to be absent, a per-process random key keeps the mechanism working;
 * forms just stop validating across a dev-server restart. Read from process.env directly so unit
 * tests can exercise this module without a database configuration.
 */
export const CSRF_COOKIE = 'moments_csrf'
export const CSRF_FIELD = 'csrf'

const secret = process.env.SESSION_SECRET ?? randomBytes(32).toString('hex')

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
