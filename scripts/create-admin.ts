
import { randomBytes } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { hashPassword } from '../src/lib/auth/password'

function generatePassword(): string {

  return randomBytes(18).toString('base64url')
}

async function main() {
  const email = (process.argv[2] ?? 'owner@moments.test').trim().toLowerCase()
  const name = (process.argv[3] ?? 'Studio Owner').trim()

  const prisma = new PrismaClient()
  try {
    const password = generatePassword()
    const { hash, algo } = await hashPassword(password)

    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } })
    if (existing) {
      await prisma.user.update({
        where: { email },
        data: { passwordHash: hash, passwordAlgo: algo, role: 'ADMIN', isActive: true, status: 'ACTIVE', mustChangePassword: true, failedAttempts: 0, lockedUntil: null },
      })
    } else {
      const company = await prisma.company.findFirst({ select: { id: true } })
      if (!company) {
        throw new Error('No company found. Seed the database first (npm run seed:demo, or prisma migrate reset).')
      }
      await prisma.user.create({
        data: { email, name, role: 'ADMIN', isActive: true, status: 'ACTIVE', mustChangePassword: true, passwordHash: hash, passwordAlgo: algo, companyId: company.id },
      })
    }

    console.log('')
    console.log('  Admin account ready. Copy the password now — it is shown only this once:')
    console.log('  ---------------------------------------------------------------')
    console.log(`  Email:    ${email}`)
    console.log(`  Password: ${password}`)
    console.log('  Role:     ADMIN')
    console.log('  ---------------------------------------------------------------')
    console.log('  Only the Argon2id hash is stored. You will be prompted to set your own password on first sign-in.')
    console.log('')
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
