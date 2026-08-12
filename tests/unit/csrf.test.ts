import { describe, expect, it } from 'vitest'
import { CSRF_COOKIE, csrfFieldValue, verifyCsrf } from '@/lib/auth/csrf'

describe('CSRF double-submit token (SEC-A04)', () => {
  const cookie = 'a-random-cookie-value-from-the-middleware'

  it('accepts the field computed for the cookie', () => {
    expect(verifyCsrf(cookie, csrfFieldValue(cookie))).toBe(true)
  })

  it('rejects a field computed for a different cookie', () => {
    expect(verifyCsrf(cookie, csrfFieldValue('some-other-cookie'))).toBe(false)
  })

  it('rejects a tampered field', () => {
    const field = csrfFieldValue(cookie)
    const tampered = (field[0] === 'a' ? 'b' : 'a') + field.slice(1)
    expect(verifyCsrf(cookie, tampered)).toBe(false)
  })

  it('rejects a missing cookie, an empty field, and non-string input', () => {
    expect(verifyCsrf(undefined, csrfFieldValue(cookie))).toBe(false)
    expect(verifyCsrf(cookie, '')).toBe(false)
    expect(verifyCsrf(cookie, null)).toBe(false)
    expect(verifyCsrf(cookie, 'zz-not-hex-at-all')).toBe(false)
  })

  it('keeps the cookie name in sync with the middleware duplicate', () => {
    // src/middleware.ts re-declares this constant because the edge runtime cannot import
    // node:crypto modules. This pins the value both files must agree on.
    expect(CSRF_COOKIE).toBe('moments_csrf')
  })
})
