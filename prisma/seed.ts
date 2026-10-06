import { PrismaClient } from '@prisma/client'
import { hashPassword } from '../src/lib/auth/password'

/**
 * Local development seed: the single company row and one admin account. No demo clients, leads or jobs
 * (the app starts empty; real data comes in through the website form and the staff screens).
 */
const prisma = new PrismaClient()

const DEV_ADMIN_PASSWORD = 'owner-dev-2026-moments' // DEVELOPMENT ONLY

async function main() {
  const company = await prisma.company.upsert({
    where: { id: 'company_moments' },
    update: {},
    create: {
      id: 'company_moments',
      name: 'Moments Photography and Film',
      currency: 'AUD',
    },
  })

  const { hash, algo } = await hashPassword(DEV_ADMIN_PASSWORD)
  await prisma.user.upsert({
    where: { email: 'owner@moments.test' },
    update: {},
    create: {
      companyId: company.id,
      email: 'owner@moments.test',
      passwordHash: hash,
      passwordAlgo: algo,
      role: 'ADMIN',
      name: 'Studio Owner',
    },
  })

  console.log('Seeded: company and admin user (owner@moments.test).')
  console.log('DEV admin password (development only):', DEV_ADMIN_PASSWORD)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
