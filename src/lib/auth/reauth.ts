import { prisma } from '@/lib/db'
import { verifyPassword } from './password'

export async function verifyUserPassword(userId: string, password: string): Promise<boolean> {
  if (!password) return false
  const row = await prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true, passwordAlgo: true } })
  if (!row) return false
  return verifyPassword(row.passwordHash, row.passwordAlgo, password)
}
