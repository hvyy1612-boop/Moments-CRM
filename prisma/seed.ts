import { createHash } from 'node:crypto'
import { Prisma, PrismaClient } from '@prisma/client'
import { hashPassword } from '../src/lib/auth/password'
import { CANCELLATION_POLICY, SUPPLIER_ABN } from '../src/lib/domain/quotation'

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

/**
 * Which packages each add-on needs or refuses (BR-P04). Stored as codes, validated on the server by
 * the pricing engine. An add-on with no entry here is unconditional.
 */
const addOnRules: Record<string, { requiresAny?: string[]; excludes?: string[] }> = {
  // The film, Super 8 and coverage add-ons attach to a shoot, so they need a package on the
  // quotation. §2.2 sells them alongside the wedding and micro packages.
  'FILM-35': { requiresAny: ['WED-PHOTO', 'MICRO-PHOTO'] },
  'FILM-120': { requiresAny: ['WED-PHOTO', 'MICRO-PHOTO'] },
  SUPER8: { requiresAny: ['WED-VIDEO', 'MICRO-VIDEO', 'WED-PHOTO'] },
  ALBUM: { requiresAny: ['WED-PHOTO', 'MICRO-PHOTO'] },
  'ALBUM-PAR': { requiresAny: ['WED-PHOTO', 'MICRO-PHOTO'] }, // and the main album, checked in the builder
  'EXTRA-HR': { requiresAny: ['WED-PHOTO', 'WED-VIDEO'] },
  'SECOND-SH': { requiresAny: ['WED-PHOTO', 'WED-VIDEO'] },
  'RAW-FOOT': { requiresAny: ['WED-VIDEO', 'MICRO-VIDEO'] },
}

/** BR-P07 and BR-P08. Both reference packages by code; evaluationOrder decides which runs first. */
const pricingRules: Prisma.PricingRuleCreateInput[] = [
  {
    code: 'BUNDLE-PV',
    name: 'Photo and video bundle',
    ruleType: 'BUNDLE',
    requiresAllPackageId: ['WED-PHOTO', 'WED-VIDEO'],
    excludesPackageId: [],
    discountType: 'FIXED',
    discountValue: '150.00',
    evaluationOrder: 1,
  },
  {
    code: 'COND-PREWED',
    name: 'Engagement session discount',
    ruleType: 'CONDITIONAL',
    requiresAllPackageId: ['WED-PHOTO'],
    excludesPackageId: ['MICRO-PHOTO'],
    appliesToTargetId: 'PRE-WED',
    discountType: 'PERCENTAGE',
    discountValue: '20.00',
    evaluationOrder: 2,
  },
]

async function main() {
  for (const p of packages) {
    await prisma.package.upsert({ where: { code: p.code }, create: p, update: p })
  }
  for (const a of addOns) {
    await prisma.addOn.upsert({ where: { code: a.code }, create: a, update: a })
  }

  // Rebuild the add-on rules each run so the codes above stay the single source of truth.
  for (const [code, rule] of Object.entries(addOnRules)) {
    const addOn = await prisma.addOn.findUnique({ where: { code }, select: { id: true } })
    if (!addOn) continue
    await prisma.addOnRule.deleteMany({ where: { addOnId: addOn.id } })
    await prisma.addOnRule.create({
      data: {
        addOnId: addOn.id,
        requiresAnyPackageId: rule.requiresAny ?? [],
        excludesPackageId: rule.excludes ?? [],
      },
    })
  }

  for (const rule of pricingRules) {
    await prisma.pricingRule.upsert({ where: { code: rule.code }, create: rule, update: rule })
  }

  console.log(
    `Seeded ${packages.length} packages, ${addOns.length} add-ons, ${Object.keys(addOnRules).length} add-on rules and ${pricingRules.length} pricing rules.`,
  )

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

    // Rebuild this client's enquiries so re-running the seed does not stack duplicates. Everything
    // downstream has to go first: the foreign keys are Restrict on purpose, so financial records
    // can never be orphaned by a careless delete (BR-I09). Order matters.
    const priorEnquiries = await prisma.enquiry.findMany({
      where: { clientId: client.id },
      select: { id: true },
    })
    const priorEnquiryIds = priorEnquiries.map((e) => e.id)
    if (priorEnquiryIds.length > 0) {
      const priorQuotations = await prisma.quotation.findMany({
        where: { enquiryId: { in: priorEnquiryIds } },
        select: { id: true },
      })
      const priorQuotationIds = priorQuotations.map((q) => q.id)
      const priorBookings = await prisma.booking.findMany({
        where: { quotationId: { in: priorQuotationIds } },
        select: { id: true },
      })
      const priorBookingIds = priorBookings.map((b) => b.id)

      // Payments hold Restrict on Invoice, invoices hold Restrict on Booking.
      await prisma.payment.deleteMany({ where: { invoice: { bookingId: { in: priorBookingIds } } } })
      await prisma.invoice.deleteMany({ where: { bookingId: { in: priorBookingIds } } })
      // Deleting the booking cascades the agreement, deliverables, questionnaire and change requests.
      await prisma.booking.deleteMany({ where: { id: { in: priorBookingIds } } })
      // Superseded links point quotation to quotation, so clear them before deleting.
      await prisma.quotation.updateMany({
        where: { id: { in: priorQuotationIds } },
        data: { supersededById: null },
      })
      await prisma.quotation.deleteMany({ where: { id: { in: priorQuotationIds } } })
      await prisma.enquiry.deleteMany({ where: { id: { in: priorEnquiryIds } } })
    }

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

  // A worked example: one job that has been through the whole lifecycle, so the demo and the
  // client portal always have something real to show (DEMO-02). The portal token is fixed and
  // clearly labelled so the demo link never changes between runs. Development data only.
  await seedWorkedExample(seededAt, DAY, packageIdByCode)

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

export const DEMO_PORTAL_TOKEN = 'demo-portal-token-development-only-0000'
const DEMO_VIEW_TOKEN = 'demo-quote-token-development-only-0000'

/**
 * Build one complete job: quotation accepted, booking confirmed, booking fee paid, balance issued,
 * one deliverable handed over. Written directly rather than through the domain layer so the shape
 * is explicit and the seed stays deterministic.
 */
async function seedWorkedExample(
  seededAt: number,
  DAY: number,
  packageIdByCode: Map<string, string>,
): Promise<void> {
  const email = 'ana.demo@moments.test'
  const client = await prisma.client.upsert({
    where: { email },
    create: {
      primaryName: 'Ana Silva',
      partnerName: 'Chris Whitmore',
      email,
      phone: '0412 000 999',
      suburb: 'Glebe',
      state: 'NSW',
      marketingConsent: true,
      consentUpdatedAt: new Date(seededAt),
    },
    update: {},
  })

  // Clear any previous run of this example, dependents first.
  const priorEnquiries = await prisma.enquiry.findMany({
    where: { clientId: client.id },
    select: { id: true },
  })
  const ids = priorEnquiries.map((e) => e.id)
  if (ids.length > 0) {
    const quotes = await prisma.quotation.findMany({
      where: { enquiryId: { in: ids } },
      select: { id: true },
    })
    const quoteIds = quotes.map((q) => q.id)
    const bookings = await prisma.booking.findMany({
      where: { quotationId: { in: quoteIds } },
      select: { id: true },
    })
    const bookingIds = bookings.map((b) => b.id)
    await prisma.payment.deleteMany({ where: { invoice: { bookingId: { in: bookingIds } } } })
    await prisma.invoice.deleteMany({ where: { bookingId: { in: bookingIds } } })
    await prisma.booking.deleteMany({ where: { id: { in: bookingIds } } })
    await prisma.quotation.deleteMany({ where: { id: { in: quoteIds } } })
    await prisma.enquiry.deleteMany({ where: { id: { in: ids } } })
  }

  const shootDate = new Date(seededAt - 40 * DAY) // shot 40 days ago, so delivery is under way
  const enquiredAt = new Date(seededAt - 200 * DAY)
  const acceptedAt = new Date(seededAt - 180 * DAY)

  const enquiry = await prisma.enquiry.create({
    data: {
      clientId: client.id,
      enquiryType: 'WEDDING',
      eventDate: shootDate,
      venueName: 'Sergeants Mess',
      venueSuburb: 'Chowder Bay',
      guestCount: 80,
      message: 'We want both photos and a film, and the engagement session as well.',
      source: 'Website enquiry form',
      status: 'WON',
      createdAt: enquiredAt,
      firstRespondedAt: new Date(enquiredAt.getTime() + 2 * 60 * 60 * 1000),
    },
  })

  // WED-PHOTO 3500 + WED-VIDEO 4500 + PRE-WED 850, less the 150 bundle and 20% off PRE-WED (170).
  const total = new Prisma.Decimal('8530.00')
  const quotation = await prisma.quotation.create({
    data: {
      enquiryId: enquiry.id,
      version: 1,
      status: 'ACCEPTED',
      viewToken: DEMO_VIEW_TOKEN,
      totalGross: total,
      gstAmount: new Prisma.Decimal('775.45'), // 8530 / 11, half up
      validUntil: new Date(acceptedAt.getTime() + 14 * DAY),
      sentAt: new Date(acceptedAt.getTime() - 3 * DAY),
      firstViewedAt: new Date(acceptedAt.getTime() - 2 * DAY),
      respondedAt: acceptedAt,
      termsAcknowledgedAt: acceptedAt,
      termsAcknowledgedIp: '203.0.113.10',
      cancellationPolicySnapshot: CANCELLATION_POLICY,
      createdBy: (await prisma.user.findUniqueOrThrow({ where: { email: 'owner@moments.test' }, select: { id: true } })).id,
      createdAt: new Date(acceptedAt.getTime() - 3 * DAY),
      lines: {
        create: [
          { sourceType: 'PACKAGE', sourceId: packageIdByCode.get('WED-PHOTO') ?? null, description: 'Wedding Photography', unitPriceGross: '3500.00', lineTotalGross: '3500.00', displayOrder: 0 },
          { sourceType: 'PACKAGE', sourceId: packageIdByCode.get('WED-VIDEO') ?? null, description: 'Wedding Videography', unitPriceGross: '4500.00', lineTotalGross: '4500.00', displayOrder: 1 },
          { sourceType: 'PACKAGE', sourceId: packageIdByCode.get('PRE-WED') ?? null, description: 'Engagement session', unitPriceGross: '850.00', lineTotalGross: '850.00', displayOrder: 2 },
          { sourceType: 'RULE', description: 'Photo and video bundle', unitPriceGross: '-150.00', lineTotalGross: '-150.00', displayOrder: 3 },
          { sourceType: 'RULE', description: 'Engagement session discount', unitPriceGross: '-170.00', lineTotalGross: '-170.00', displayOrder: 4 },
        ],
      },
    },
  })

  const booking = await prisma.booking.create({
    data: {
      quotationId: quotation.id,
      clientId: client.id,
      status: 'CONFIRMED',
      shootDate,
      venueName: 'Sergeants Mess',
      venueAddress: 'Chowder Bay Road, Mosman',
      coverageHours: 6,
      dateLockedAt: new Date(acceptedAt.getTime() + 2 * DAY),
      portalToken: DEMO_PORTAL_TOKEN,
      portalTokenIssuedAt: acceptedAt,
      createdAt: acceptedAt,
    },
  })

  await prisma.agreement.create({
    data: {
      bookingId: booking.id,
      quotationId: quotation.id,
      clientId: client.id,
      quotationVersion: 1,
      totalGross: total,
      termsText: CANCELLATION_POLICY,
      acceptedName: 'Ana Silva',
      acceptedAt,
      acceptedIp: '203.0.113.10',
      contentHash: createHash('sha256').update(`v1|${total.toFixed(2)}|${CANCELLATION_POLICY}`).digest('hex'),
      createdAt: acceptedAt,
    },
  })

  const buyerName = 'Ana Silva and Chris Whitmore'
  const fee = new Prisma.Decimal('1706.00') // 20% of 8530
  const feeInvoice = await prisma.invoice.create({
    data: {
      bookingId: booking.id,
      invoiceNumber: 'INV-2026-9001',
      type: 'BOOKING_FEE',
      issueDate: acceptedAt,
      dueDate: acceptedAt,
      totalGross: fee,
      gstAmount: new Prisma.Decimal('155.09'), // 1706 / 11
      amountPaid: fee,
      status: 'PAID',
      buyerName,
      supplierAbn: SUPPLIER_ABN,
      createdAt: acceptedAt,
    },
  })

  await prisma.payment.create({
    data: {
      invoiceId: feeInvoice.id,
      amountGross: fee,
      method: 'BANK_TRANSFER',
      provider: 'MANUAL',
      receivedDate: new Date(acceptedAt.getTime() + 2 * DAY),
      reference: 'Silva booking fee',
      recordedByUserId: (await prisma.user.findUniqueOrThrow({ where: { email: 'owner@moments.test' }, select: { id: true } })).id,
      createdAt: new Date(acceptedAt.getTime() + 2 * DAY),
    },
  })

  const balance = new Prisma.Decimal('6824.00')
  await prisma.invoice.create({
    data: {
      bookingId: booking.id,
      invoiceNumber: 'INV-2026-9002',
      type: 'BALANCE',
      issueDate: new Date(acceptedAt.getTime() + 2 * DAY),
      dueDate: new Date(shootDate.getTime() - 7 * DAY),
      totalGross: balance,
      gstAmount: new Prisma.Decimal('620.36'), // 6824 / 11
      amountPaid: balance,
      status: 'PAID',
      buyerName,
      supplierAbn: SUPPLIER_ABN,
      createdAt: new Date(acceptedAt.getTime() + 2 * DAY),
      payments: {
        create: {
          amountGross: balance,
          method: 'BANK_TRANSFER',
          provider: 'MANUAL',
          receivedDate: new Date(shootDate.getTime() - 9 * DAY),
          reference: 'Silva balance',
          recordedByUserId: (await prisma.user.findUniqueOrThrow({ where: { email: 'owner@moments.test' }, select: { id: true } })).id,
        },
      },
    },
  })

  const deliveredAt = new Date(shootDate.getTime() + 3 * DAY)
  await prisma.deliverable.createMany({
    data: [
      {
        bookingId: booking.id,
        type: 'SNEAK_PEEK',
        status: 'DELIVERED',
        dueDate: new Date(shootDate.getTime() + 3 * DAY),
        galleryUrl: 'https://gallery.momentsphotography.com.au/silva-sneak-peek',
        deliveredAt,
        galleryExpiresAt: new Date(deliveredAt.getTime() + 365 * DAY),
        backupExpiresAt: new Date(deliveredAt.getTime() + 180 * DAY),
      },
      { bookingId: booking.id, type: 'PHOTO_GALLERY', status: 'IN_PROGRESS', dueDate: new Date(shootDate.getTime() + 120 * DAY) },
      { bookingId: booking.id, type: 'VIDEO_FILM', status: 'PENDING', dueDate: new Date(shootDate.getTime() + 240 * DAY) },
      { bookingId: booking.id, type: 'PORTRAIT_GALLERY', status: 'DELIVERED', dueDate: new Date(shootDate.getTime() - 60 * DAY), galleryUrl: 'https://gallery.momentsphotography.com.au/silva-engagement', deliveredAt: new Date(shootDate.getTime() - 65 * DAY), galleryExpiresAt: new Date(shootDate.getTime() + 300 * DAY), backupExpiresAt: new Date(shootDate.getTime() + 115 * DAY) },
    ],
  })

  await prisma.planningQuestionnaire.create({
    data: { bookingId: booking.id, status: 'SUBMITTED', submittedAt: new Date(shootDate.getTime() - 55 * DAY), responses: { ceremonyVenue: 'Sergeants Mess', ceremonyTime: '3:30pm', mustHaveShots: 'Both grandmothers together' } },
  })

  await prisma.activityLog.createMany({
    data: [
      { clientId: client.id, relatedType: 'Enquiry', relatedId: enquiry.id, actorType: 'SYSTEM', action: 'enquiry.created', detailJson: { enquiryType: 'WEDDING' }, visibleToClient: true, createdAt: enquiredAt },
      { clientId: client.id, relatedType: 'Quotation', relatedId: quotation.id, actorType: 'CLIENT', action: 'quotation.accepted', detailJson: { totalGross: '8530.00' }, visibleToClient: true, createdAt: acceptedAt },
      { clientId: client.id, relatedType: 'Booking', relatedId: booking.id, actorType: 'SYSTEM', action: 'booking.confirmed', detailJson: { from: 'PENDING_BOOKING_FEE', to: 'CONFIRMED' }, visibleToClient: true, createdAt: new Date(acceptedAt.getTime() + 2 * DAY) },
    ],
  })

  console.log(`Seeded a worked example booking. Client portal: /portal/${DEMO_PORTAL_TOKEN}`)
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error)
    await prisma.$disconnect()
    process.exit(1)
  })
