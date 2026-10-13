import { prisma } from '@/lib/db'
import { verifyPassword } from './password'

const REAUTH_THRESHOLD = 5
const REAUTH_LOCK_MS = 5 * 60 * 1000

export async function verifyUserPasswordWithLockout(userId: string, password: string, now: Date = new Date()): Promise<'ok' | 'wrong' | 'locked'> {
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true, passwordAlgo: true, failedAttempts: true, lockedUntil: true },
  })
  if (!row) return 'wrong'
  if (row.lockedUntil && row.lockedUntil.getTime() > now.getTime()) return 'locked'
  if (password && (await verifyPassword(row.passwordHash, row.passwordAlgo, password))) {
    if (row.failedAttempts > 0 || row.lockedUntil) await prisma.user.update({ where: { id: userId }, data: { failedAttempts: 0, lockedUntil: null } })
    return 'ok'
  }

  if (row.lockedUntil) await prisma.user.update({ where: { id: userId }, data: { failedAttempts: 0, lockedUntil: null } })
  const updated = await prisma.user.update({ where: { id: userId }, data: { failedAttempts: { increment: 1 } }, select: { failedAttempts: true } })
  if (updated.failedAttempts >= REAUTH_THRESHOLD) {
    await prisma.user.update({ where: { id: userId }, data: { lockedUntil: new Date(now.getTime() + REAUTH_LOCK_MS) } })
    return 'locked'
  }
  return 'wrong'
}
