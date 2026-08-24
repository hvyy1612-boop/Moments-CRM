/**
 * Bootstrap an ADMIN account with a generated one-time password.
 *
 *   npm run create-admin -- [email] [name]
 *   (defaults: owner@moments.test / Studio Owner)
 *
 * The password is generated with a CSPRNG, shown ONCE in this output for you to copy, then only its
 * Argon2id hash is stored. The plaintext is never written to the database, logs, audit logs, source,
 * or git — it is discarded when this process exits. Run it where DATABASE_URL points at the target DB
 * (prepend DATABASE_URL='<neon-url>' to target the live Neon database). Change the password after you
 * sign in, or reset it any time via Forgot password.
 */
import { randomBytes } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { hashPassword } from '../src/lib/auth/password'

function generatePassword(): string {
  // 18 random bytes -> ~24 URL-safe chars: high entropy, well over the 12-char minimum, not guessable.
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
        data: { passwordHash: hash, passwordAlgo: algo, role: 'ADMIN', isActive: true, failedAttempts: 0, lockedUntil: null },
      })
    } else {
      const company = await prisma.company.findFirst({ select: { id: true } })
      if (!company) {
        throw new Error('No company found. Seed the database first (npm run seed:demo, or prisma migrate reset).')
      }
      await prisma.user.create({
        data: { email, name, role: 'ADMIN', isActive: true, passwordHash: hash, passwordAlgo: algo, companyId: company.id },
      })
    }

    // Shown ONCE. Only the Argon2id hash is stored; this plaintext is discarded when the process exits.
    console.log('')
    console.log('  Admin account ready. Copy the password now — it is shown only this once:')
    console.log('  ---------------------------------------------------------------')
    console.log(`  Email:    ${email}`)
    console.log(`  Password: ${password}`)
    console.log('  Role:     ADMIN')
    console.log('  ---------------------------------------------------------------')
    console.log('  Only the Argon2id hash is stored. Change this password after you sign in.')
    console.log('')
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
