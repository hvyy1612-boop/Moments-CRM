import { createHmac, timingSafeEqual } from 'node:crypto'

export const STEPUP_COOKIE = 'moments_stepup_activity'
export const STEPUP_TTL_MS = 10 * 60 * 1000

const DEV_FALLBACK_KEY = 'development-only-csrf-key-never-used-in-production'
const secret = process.env.SESSION_SECRET ?? DEV_FALLBACK_KEY

function sign(payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex')
}

export function issueStepUp(userId: string, expiresAt: number): string {
  const payload = `${userId}.${expiresAt}`
  return `${payload}.${sign(payload)}`
}

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
