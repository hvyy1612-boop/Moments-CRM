import { describe, expect, it, vi } from 'vitest'
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

  it('SEC-A04 a field minted by one module instance verifies in another', async () => {

    const field = csrfFieldValue(cookie)
    vi.resetModules()
    const fresh = await import('@/lib/auth/csrf')
    expect(fresh.verifyCsrf(cookie, field)).toBe(true)
  })

  it('keeps the cookie name in sync with the middleware duplicate', () => {

    expect(CSRF_COOKIE).toBe('moments_csrf')
  })
})
