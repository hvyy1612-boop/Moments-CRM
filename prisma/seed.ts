import { Prisma, PrismaClient } from '@prisma/client'
import { hashPassword } from '../src/lib/auth/password'

const prisma = new PrismaClient()

const users = [
  { email: 'owner@moments.test', name: 'Studio Owner', role: 'ADMIN', password: 'owner-dev-2026-moments' },
  { email: 'photographer@moments.test', name: 'Photographer', role: 'STUDIO', password: 'photo-dev-2026-moments' },
  { email: 'videographer@moments.test', name: 'Videographer', role: 'STUDIO', password: 'video-dev-2026-moments' },
  { email: 'editor@moments.test', name: 'Editor', role: 'EDITOR', password: 'editor-dev-2026-moments' },

  { email: 'lockout@moments.test', name: 'Lockout test account (dev only)', role: 'EDITOR', password: 'lockout-dev-2026-moments' },
] as const

const PLACEHOLDER = '0.00'

const packages: Prisma.PackageCreateInput[] = [
  {
    code: 'WED-PHOTO',
    name: 'Wedding Photography',
    priceGross: '3500.00',
    includedHours: 6,
    includedTravelKm: 100,
    maxExtraHours: 4, // assumes 10 hours in total, pending OQ-004
    displayOrder: 1,
    description:
      '6 hours of coverage, 600 or more edited images, an online gallery, a welcome guide, a consultation and a personalised timeline. Travel within 100 km of Sydney CBD. Extra hours are available up to 10 in total.',
  },
  {
    code: 'WED-VIDEO',
    name: 'Wedding Videography',
    priceGross: '4500.00',
    includedHours: 6,
    includedTravelKm: 100,
    maxExtraHours: 4,
    displayOrder: 2,
    description:
      '6 hours of coverage, a 4K trailer of 4 minutes or more, music licensing, and drone footage where it is allowed. Travel within 100 km of Sydney CBD. Extra hours are available up to 10 in total.',
  },
  {
    code: 'MICRO-PHOTO',
    name: 'Micro wedding or Elopement',
    priceGross: '1500.00',
    includedHours: 2,
    includedTravelKm: 50,
    maxExtraHours: 0,
    displayOrder: 3,
    description:
      '2 hours of photography, 200 or more edited images, and a gallery you can download. Travel within 50 km of Sydney CBD.',
  },
  {
    code: 'MICRO-VIDEO',
    name: 'Micro wedding Video',
    priceGross: '2000.00',
    includedHours: 2,
    includedTravelKm: 50,
    maxExtraHours: 0,
    displayOrder: 4,
    description:
      '2 hours of videography, a 4K film of 3 minutes or more, the full ceremony on one camera up to 30 minutes, drone footage, and music licensing. Travel within 50 km of Sydney CBD.',
  },
  {
    code: 'PRE-WED',
    name: 'Engagement session',
    priceGross: '850.00',
    includedHours: 1,
    includedTravelKm: 50,
    maxExtraHours: 0,
    displayOrder: 5,
    description:
      '1 to 1.5 hours of photography, 200 or more edited images, a style guide, a gallery and a consultation. Free travel within 50 km of Sydney CBD. 20 percent off when booked with Wedding Photography.',
  },
]

const addOns: Prisma.AddOnCreateInput[] = [
  {
    code: 'FILM-35',
    name: '35mm film, 2 rolls',
    priceGrossBefore: '350.00',
    displayOrder: 1,
    description:
      'Two rolls of 35mm film, around 60 photos, added to your gallery with lab processing and scanning.',
  },
  {
    code: 'FILM-120',
    name: '120mm film, 1 roll',
    priceGrossBefore: PLACEHOLDER,
    displayOrder: 2,
    description:
      'Price to be confirmed (OQ-001). The studio site currently lists both 150 and 200 for this roll.',
  },
  {
    code: 'SUPER8',
    name: 'Super 8 film',
    priceGrossBefore: '800.00',
    displayOrder: 3,
    description:
      'Two to three minutes of Super 8 video with music licensing and lab processing. Available with wedding packages. A second videographer may be needed alongside videography.',
  },
  {
    code: 'ALBUM',
    name: '10 by 10 inch linen album, 30 pages',
    priceGrossBefore: '1200.00',
    priceGrossAfter: '1400.00',
    displayOrder: 4,
    description:
      'A 10 by 10 inch, 30 page linen album with 3 design revisions. The price is 1200 before the day and 1400 after.',
  },
  {
    code: 'ALBUM-PAR',
    name: 'Parent album',
    priceGrossBefore: '500.00',
    displayOrder: 5,
    description: 'A copy of the main album for parents. Needs the main album.',
  },
  {
    code: 'EXTRA-HR',
    name: 'Extra hour of coverage',
    priceGrossBefore: PLACEHOLDER,
    displayOrder: 6,
    description: 'Price to be confirmed (OQ-002).',
  },
  {
    code: 'SECOND-SH',
    name: 'Second shooter',
    priceGrossBefore: PLACEHOLDER,
    displayOrder: 7,
    description: 'Price to be confirmed (OQ-003).',
  },
  {
    code: 'RAW-FOOT',
    name: 'Raw video footage',
    priceGrossBefore: PLACEHOLDER,
    displayOrder: 8,
    description: 'Quoted for each job and includes the hard drive. Order before the shoot date.',
  },
]

async function main() {
  for (const p of packages) {
    await prisma.package.upsert({ where: { code: p.code }, create: p, update: p })
  }
  for (const a of addOns) {
    await prisma.addOn.upsert({ where: { code: a.code }, create: a, update: a })
  }
  console.log(`Seeded ${packages.length} packages and ${addOns.length} add-ons.`)

  for (const u of users) {
    const hashed = await hashPassword(u.password)
    const data = {
      email: u.email,
      name: u.name,
      role: u.role,
      passwordHash: hashed.hash,
      passwordAlgo: hashed.algo,
      isActive: true,
      mustChangePassword: false,
      failedAttempts: 0,
      lockedUntil: null,
    }
    await prisma.user.upsert({ where: { email: u.email }, create: data, update: data })
  }

  const testUsers = await prisma.user.findMany({
    where: { email: { endsWith: '@moments.test' } },
    select: { id: true },
  })
  const ids = testUsers.map((u) => u.id)
  await prisma.passwordReset.deleteMany({ where: { userId: { in: ids } } })
  await prisma.notification.deleteMany({ where: { recipient: { endsWith: '@moments.test' } } })

  console.log('')
  console.log('Development sign-ins (DEVELOPMENT ONLY — never use these in production):')
  for (const u of users) {
    console.log(`  ${u.role.padEnd(6)} ${u.email.padEnd(28)} ${u.password}`)
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error)
    await prisma.$disconnect()
    process.exit(1)
  })
