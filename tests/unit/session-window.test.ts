import { describe, it, expect } from 'vitest'
import {
  sessionWindow,
  IDLE_TIMEOUT_MS,
  ABSOLUTE_TIMEOUT_MS,
  REMEMBER_TIMEOUT_MS,
} from '@/lib/auth/session'

describe('session window (SEC-S02)', () => {
  const now = new Date('2026-08-12T09:00:00+10:00')

  it('SEC-S02 default session idles at 30 minutes and expires absolutely at 8 hours', () => {
    const { expiresAt, absoluteExpiresAt } = sessionWindow(now, false)
    expect(expiresAt.getTime() - now.getTime()).toBe(IDLE_TIMEOUT_MS)
    expect(absoluteExpiresAt.getTime() - now.getTime()).toBe(ABSOLUTE_TIMEOUT_MS)
  })

  it('BR-G10 stay-signed-in extends the absolute lifetime to 7 days and never the idle timeout', () => {
    const { expiresAt, absoluteExpiresAt } = sessionWindow(now, true)
    expect(absoluteExpiresAt.getTime() - now.getTime()).toBe(REMEMBER_TIMEOUT_MS)
    expect(expiresAt.getTime() - now.getTime()).toBe(IDLE_TIMEOUT_MS)
  })

  it('the idle expiry is never later than the absolute expiry', () => {
    for (const remember of [true, false]) {
      const { expiresAt, absoluteExpiresAt } = sessionWindow(now, remember)
      expect(expiresAt.getTime()).toBeLessThanOrEqual(absoluteExpiresAt.getTime())
    }
  })
})
