import { Prisma, PrismaClient } from '@prisma/client'
import { hashPassword } from '../src/lib/auth/password'

const prisma = new PrismaClient()

// §13: known development passwords, printed with a warning. Development and test only — real
// accounts are created by admin invitation and never ship with a seeded password.
const users = [
  { email: 'owner@moments.test', name: 'Studio Owner', role: 'ADMIN', password: 'owner-dev-2026-moments' },
  { email: 'photographer@moments.test', name: 'Photographer', role: 'STUDIO', password: 'photo-dev-2026-moments' },
  { email: 'videographer@moments.test', name: 'Videographer', role: 'STUDIO', password: 'video-dev-2026-moments' },
  { email: 'editor@moments.test', name: 'Editor', role: 'EDITOR', password: 'editor-dev-2026-moments' },
  // e2e fixtures. Each test that MUTATES an account gets its own, so a parallel run cannot change
  // the password another test is signing in with.
  { email: 'lockout@moments.test', name: 'Lockout test account (dev only)', role: 'EDITOR', password: 'lockout-dev-2026-moments' },
  { email: 'reset@moments.test', name: 'Reset test account (dev only)', role: 'EDITOR', password: 'reset-dev-2026-moments' },
] as const

// Placeholder for add-ons the studio has not published a price for yet (OQ-001, OQ-002, OQ-003).
// The catalogue shows "Price on enquiry" for these until the studio confirms a figure. We never
// invent a business fact (R2).
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

  // Users are re-hashed and their auth state reset on every run, so repeated e2e runs start from
  // a known state (SEC-S04 counters cleared, passwords back to the printed values).
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

  // Demo enquiries (§13, DEMO-02): at least one record in every state a demo needs, including the
  // two BR-E07 breaches. Ages are relative to the seed run so the response clock is always
  // meaningful. Rebuilt on every run so demos and e2e start from the same picture.
  const HOUR = 60 * 60 * 1000
  const DAY = 24 * HOUR
  const seededAt = Date.now()
  const demoEnquiries = [
    {
      email: 'harper.demo@moments.test',
      primaryName: 'Harper Nguyen',
      partnerName: 'Tom Reilly',
      phone: '0412 000 111',
      suburb: 'Marrickville',
      marketingConsent: true,
      enquiryType: 'WEDDING',
      status: 'NEW',
      ageMs: 50 * HOUR, // BR-E07 escalated, past 48 hours
      eventInDays: 300,
      venueName: 'Gunners Barracks',
      venueSuburb: 'Mosman',
      guestCount: 90,
      message: 'We found you through a friend’s wedding. We would love both photo and video if it fits our budget.',
      packageCodes: ['WED-PHOTO', 'WED-VIDEO'],
    },
    {
      email: 'sione.demo@moments.test',
      primaryName: 'Sione Faletau',
      partnerName: 'Mele Vaka',
      phone: '0412 000 222',
      suburb: 'Liverpool',
      marketingConsent: false,
      enquiryType: 'WEDDING',
      status: 'NEW',
      ageMs: 30 * HOUR, // BR-E07 alert, past 24 hours
      eventInDays: 210,
      venueName: 'Curzon Hall',
      venueSuburb: 'Marsfield',
      guestCount: 150,
      message: 'Saturday in March. Is a second shooter available for the church?',
      packageCodes: ['WED-PHOTO'],
    },
    {
      email: 'dani.demo@moments.test',
      primaryName: 'Dani Kaur',
      partnerName: null,
      phone: '0412 000 333',
      suburb: 'Newtown',
      marketingConsent: false,
      enquiryType: 'PORTRAIT',
      status: 'NEW',
      ageMs: 3 * HOUR, // still inside the commitment
      eventInDays: 45,
      venueName: null,
      venueSuburb: null,
      guestCount: null,
      message: 'Looking for family portraits before my parents fly home.',
      packageCodes: [],
    },
    {
      email: 'alex.demo@moments.test',
      primaryName: 'Alex Romano',
      partnerName: 'Jesse Lim',
      phone: '0412 000 444',
      suburb: 'Bondi',
      marketingConsent: true,
      enquiryType: 'MICRO',
      status: 'CONTACTED',
      respondedAfterMs: 4 * HOUR,
      ageMs: 6 * DAY,
      eventInDays: 120,
      venueName: 'Watsons Bay',
      venueSuburb: 'Watsons Bay',
      guestCount: 20,
      message: 'Just the two of us and our parents.',
      packageCodes: ['MICRO-PHOTO'],
    },
    {
      email: 'priya.demo@moments.test',
      primaryName: 'Priya Sharma',
      partnerName: 'Ravi Sharma',
      phone: '0412 000 555',
      suburb: 'Parramatta',
      marketingConsent: false,
      enquiryType: 'WEDDING',
      status: 'LOST',
      lostReason: 'Date unavailable',
      respondedAfterMs: 2 * HOUR,
      ageMs: 30 * DAY,
      eventInDays: 90,
      venueName: 'Oatlands House',
      venueSuburb: 'Oatlands',
      guestCount: 200,
      message: 'Our date is a Saturday in October.',
      packageCodes: ['WED-PHOTO'],
    },
  ] as const

  const packageIdByCode = new Map(
    (await prisma.package.findMany({ select: { id: true, code: true } })).map((p) => [p.code, p.id]),
  )

  for (const demo of demoEnquiries) {
    const client = await prisma.client.upsert({
      where: { email: demo.email },
      create: {
        primaryName: demo.primaryName,
        partnerName: demo.partnerName ?? null,
        email: demo.email,
        phone: demo.phone,
        suburb: demo.suburb,
        state: 'NSW',
        marketingConsent: demo.marketingConsent,
        consentUpdatedAt: demo.marketingConsent ? new Date() : null,
      },
      update: {},
    })

    // Rebuild this client's enquiries so re-running the seed does not stack duplicates.
    await prisma.enquiry.deleteMany({ where: { clientId: client.id } })

    const createdAt = new Date(seededAt - demo.ageMs)
    const enquiry = await prisma.enquiry.create({
      data: {
        clientId: client.id,
        enquiryType: demo.enquiryType,
        eventDate: new Date(seededAt + demo.eventInDays * DAY),
        venueName: demo.venueName ?? null,
        venueSuburb: demo.venueSuburb ?? null,
        guestCount: demo.guestCount ?? null,
        message: demo.message,
        source: 'Website enquiry form',
        status: demo.status,
        lostReason: 'lostReason' in demo ? demo.lostReason : null,
        createdAt,
        firstRespondedAt:
          'respondedAfterMs' in demo ? new Date(createdAt.getTime() + demo.respondedAfterMs) : null,
        packages: {
          create: demo.packageCodes
            .map((code) => packageIdByCode.get(code))
            .filter((id): id is string => Boolean(id))
            .map((packageId) => ({ packageId })),
        },
      },
    })

    // One timeline row so the detail screen shows a real history (BR-L03).
    await prisma.activityLog.create({
      data: {
        clientId: client.id,
        relatedType: 'Enquiry',
        relatedId: enquiry.id,
        actorType: 'SYSTEM',
        action: 'enquiry.created',
        detailJson: { enquiryType: demo.enquiryType },
        visibleToClient: true,
        createdAt,
      },
    })
  }
  console.log(`Seeded ${demoEnquiries.length} demo enquiries.`)

  // Test artefacts from earlier e2e runs: reset tokens and queued mail for the .test accounts.
  // (SecurityEvent is insert-only by design and is left alone; e2e uses per-run addresses instead.)
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
