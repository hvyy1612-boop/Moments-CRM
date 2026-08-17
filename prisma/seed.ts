import { PrismaClient, ResourceType } from '@prisma/client'
import { hashPassword } from '../src/lib/auth/password'

/**
 * Fresh seed for the Project-centric schema (Slice 1). Single company row, one admin user, and a
 * small demo client + project so the workspace is not empty. No production data.
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
      timezone: 'Australia/Sydney',
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

  // A small pool of bookable resources so staff can staff a shoot. Generic role names, not real
  // people (R16); link a resource to a user account in a later slice.
  const resources: { id: string; resourceType: ResourceType; name: string }[] = [
    { id: 'res_lead_photographer', resourceType: ResourceType.PHOTOGRAPHER, name: 'Lead Photographer' },
    { id: 'res_second_shooter', resourceType: ResourceType.SECOND_SHOOTER, name: 'Second Shooter' },
    { id: 'res_videographer', resourceType: ResourceType.VIDEOGRAPHER, name: 'Videographer' },
  ]
  for (const resource of resources) {
    await prisma.resource.upsert({
      where: { id: resource.id },
      update: {},
      create: { companyId: company.id, ...resource },
    })
  }

  // A demo client + project in the ENQUIRY stage so /projects has something to show.
  const client = await prisma.client.upsert({
    where: { email: 'demo.client@moments.test' },
    update: {},
    create: {
      companyId: company.id,
      displayName: 'Ana and Ben',
      email: 'demo.client@moments.test',
      phone: '0400 000 000',
      status: 'PROSPECT',
    },
  })
  const existing = await prisma.project.findUnique({ where: { code: 'MPF-2026-0001' } })
  if (!existing) {
    await prisma.project.create({
      data: {
        companyId: company.id,
        clientId: client.id,
        code: 'MPF-2026-0001',
        name: 'Wedding',
        lifecycleStatus: 'ENQUIRY',
        source: 'referral',
        enquiryNotes: 'Enquiry from the website. Autumn wedding, around 90 guests.',
      },
    })
  }

  console.log('Seeded: company, admin user (owner@moments.test), demo client + project.')
  console.log('DEV admin password (development only):', DEV_ADMIN_PASSWORD)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
