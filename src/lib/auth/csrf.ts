import { createHmac, timingSafeEqual } from 'node:crypto'

export const CSRF_COOKIE = 'moments_csrf'
export const CSRF_FIELD = 'csrf'

const DEV_FALLBACK_KEY = 'development-only-csrf-key-never-used-in-production'
const secret = process.env.SESSION_SECRET ?? DEV_FALLBACK_KEY

export function csrfFieldValue(cookieValue: string): string {
  return createHmac('sha256', secret).update(cookieValue).digest('hex')
}

export function verifyCsrf(cookieValue: string | undefined, fieldValue: unknown): boolean {
  if (!cookieValue || typeof fieldValue !== 'string' || fieldValue.length === 0) return false
  const expected = Buffer.from(csrfFieldValue(cookieValue), 'hex')
  const provided = Buffer.from(fieldValue, 'hex')
  if (provided.length !== expected.length) return false
  return timingSafeEqual(expected, provided)
}
