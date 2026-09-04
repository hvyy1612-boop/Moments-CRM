
import { PrismaClient } from '@prisma/client'
import { checkPasswordPolicy, hashPassword } from '../src/lib/auth/password'

async function main() {
  const [email, password] = process.argv.slice(2)
  if (!email || !password) {
    console.error("Usage: npm run set-password -- <email> '<new-password>'")
    process.exit(1)
  }

  const policyError = checkPasswordPolicy(password)
  if (policyError === 'weak') {
    console.error('Password rejected: use at least 8 characters with a letter, a number, and a special character.')
    process.exit(1)
  }
  if (policyError === 'too_common') {
    console.error('Password rejected: that password is too common.')
    process.exit(1)
  }

  const prisma = new PrismaClient()
  try {
    const { hash, algo } = await hashPassword(password)
    const user = await prisma.user.update({
      where: { email },
      data: { passwordHash: hash, passwordAlgo: algo, failedAttempts: 0, lockedUntil: null },
      select: { email: true },
    })
    console.log(`Password reset for ${user.email}. The old password no longer works; use the new one.`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
