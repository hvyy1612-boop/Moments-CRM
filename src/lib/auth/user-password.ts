import { prisma } from '@/lib/db'
import { hashPassword } from './password'

export async function passwordCredentials(
  plainPassword: string,
): Promise<{ passwordHash: string; passwordAlgo: string }> {
  const hashed = await hashPassword(plainPassword)
  return { passwordHash: hashed.hash, passwordAlgo: hashed.algo }
}

export async function setOwnPassword(userId: string, plainPassword: string): Promise<void> {
  const hashed = await hashPassword(plainPassword)
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: hashed.hash, passwordAlgo: hashed.algo, mustChangePassword: false },
  })
}

export async function resetUserPassword(userId: string, plainPassword: string): Promise<void> {
  const hashed = await hashPassword(plainPassword)
  await prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash: hashed.hash,
      passwordAlgo: hashed.algo,
      mustChangePassword: true,
      failedAttempts: 0,
      lockedUntil: null,
    },
  })
}
