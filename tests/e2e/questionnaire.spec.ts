import { expect, test, type Page } from '@playwright/test'
import { PrismaClient } from '@prisma/client'

/**
 * The planning questionnaire (BR-QN02, BR-QN03) and crew assignment (BR-B05).
 *
 * The worked example is a past shoot, so the questionnaire tests need a booking whose date is
 * still ahead. This creates one directly and cleans up after itself, rather than leaning on
 * whatever the seed happens to leave behind.
 */
const RUN = `${Math.floor(Math.random() * 250) + 1}.${Math.floor(Math.random() * 250) + 1}`

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
}

test.describe('planning questionnaire', () => {
  const token = `future-booking-token-${RUN.replace('.', '-')}`
  let clientId = ''

  test.beforeAll(async () => {
    const prisma = new PrismaClient()
    const owner = await prisma.user.findUniqueOrThrow({
      where: { email: 'owner@moments.test' },
      select: { id: true },
    })
    const client = await prisma.client.create({
      data: {
        primaryName: 'Future Couple',
        email: `future-${RUN.replace('.', '-')}@moments.test`,
      },
    })
    clientId = client.id
    const shootDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
    const enquiry = await prisma.enquiry.create({
      data: { clientId: client.id, enquiryType: 'WEDDING', eventDate: shootDate, status: 'WON' },
    })
    const quotation = await prisma.quotation.create({
      data: {
        enquiryId: enquiry.id,
        status: 'ACCEPTED',
        viewToken: `qt-${token}`,
        totalGross: '3500.00',
        gstAmount: '318.18',
        cancellationPolicySnapshot: 'Terms.',
        createdBy: owner.id,
      },
    })
    const booking = await prisma.booking.create({
      data: {
        quotationId: quotation.id,
        clientId: client.id,
        status: 'CONFIRMED',
        shootDate,
        coverageHours: 6,
        portalToken: token,
        portalTokenIssuedAt: new Date(),
      },
    })
    await prisma.planningQuestionnaire.create({
      data: { bookingId: booking.id, status: 'PENDING' },
    })
    await prisma.$disconnect()
  })

  test.afterAll(async () => {
    const prisma = new PrismaClient()
    const enquiries = await prisma.enquiry.findMany({ where: { clientId }, select: { id: true } })
    const quotations = await prisma.quotation.findMany({
      where: { enquiryId: { in: enquiries.map((e) => e.id) } },
      select: { id: true },
    })
    const bookings = await prisma.booking.findMany({
      where: { quotationId: { in: quotations.map((q) => q.id) } },
      select: { id: true },
    })
    await prisma.booking.deleteMany({ where: { id: { in: bookings.map((b) => b.id) } } })
    await prisma.quotation.deleteMany({ where: { id: { in: quotations.map((q) => q.id) } } })
    await prisma.enquiry.deleteMany({ where: { id: { in: enquiries.map((e) => e.id) } } })
    await prisma.$disconnect()
  })

  test('BR-QN03 the couple fill it in from their own link, with no account', async ({ page }) => {
    await page.goto(`/portal/${token}`)
    await expect(page.getByRole('heading', { name: 'Planning your day' })).toBeVisible()

    // BR-QN02: the question set is fixed. The first is required, the rest are not.
    await page.getByRole('button', { name: 'Send to the studio' }).click()
    await expect(page.getByText('Please answer this one.')).toBeVisible()

    await page.getByLabel('Ceremony venue and start time').fill('Sergeants Mess, 3:30pm')
    await page.getByLabel('Photographs you would be sad to miss').fill('Both grandmothers together')
    await page.getByRole('button', { name: 'Send to the studio' }).click()

    await expect(page.getByText('Thank you, the studio has your plans.')).toBeVisible()
    await expect(page.getByText('Sergeants Mess, 3:30pm')).toBeVisible()
  })

  test('the answers reach the studio, and can still be changed', async ({ page }) => {
    await page.goto(`/portal/${token}`)
    // The other test in this group may have submitted already, which collapses the form to a
    // summary. Either way, open the form before editing.
    const reopen = page.getByRole('button', { name: 'Change an answer' })
    if (await reopen.isVisible().catch(() => false)) await reopen.click()

    await page.getByLabel('Ceremony venue and start time').fill('Chowder Bay, 4:00pm')
    await page.getByRole('button', { name: 'Send to the studio' }).click()
    await expect(page.getByText('Thank you, the studio has your plans.')).toBeVisible()

    // BR-QN03: editable up to the shoot.
    await page.getByRole('button', { name: 'Change an answer' }).click()
    await page.getByLabel('Access and parking').fill('Gate code 1234')
    await page.getByRole('button', { name: 'Send to the studio' }).click()
    await expect(page.getByText('Gate code 1234')).toBeVisible()

    // And the studio sees them on the booking.
    await signIn(page, 'owner@moments.test', 'owner-dev-2026-moments')
    await page.goto('/bookings')
    await page.getByRole('link', { name: /Future Couple/ }).click()
    await expect(page.getByRole('heading', { name: 'Planning answers' })).toBeVisible()
    await expect(page.getByText('Chowder Bay, 4:00pm')).toBeVisible()
  })
})

test.describe('crew assignment', () => {
  test.use({ extraHTTPHeaders: { 'x-forwarded-for': `10.${RUN}.31` } })

  test('BR-B05 a crew member cannot hold two confirmed bookings on one date', async ({ page }) => {
    const prisma = new PrismaClient()
    const photographer = await prisma.crewMember.findFirstOrThrow({
      where: { name: 'Studio photographer' },
      select: { id: true },
    })
    // Two confirmed bookings on the same day, the first already crewed.
    const shootDate = new Date(Date.now() + 120 * 24 * 60 * 60 * 1000)
    const owner = await prisma.user.findUniqueOrThrow({
      where: { email: 'owner@moments.test' },
      select: { id: true },
    })

    const made: string[] = []
    for (const index of [0, 1]) {
      const client = await prisma.client.create({
        data: { primaryName: `Clash ${index}`, email: `clash-${index}-${RUN.replace('.', '-')}@moments.test` },
      })
      const enquiry = await prisma.enquiry.create({
        data: { clientId: client.id, enquiryType: 'WEDDING', eventDate: shootDate, status: 'WON' },
      })
      const quotation = await prisma.quotation.create({
        data: {
          enquiryId: enquiry.id,
          status: 'ACCEPTED',
          viewToken: `clash-${index}-${RUN.replace('.', '-')}`,
          totalGross: '3500.00',
          gstAmount: '318.18',
          cancellationPolicySnapshot: 'Terms.',
          createdBy: owner.id,
        },
      })
      const booking = await prisma.booking.create({
        data: {
          quotationId: quotation.id,
          clientId: client.id,
          status: 'CONFIRMED',
          shootDate,
          coverageHours: 6,
          portalToken: `clashp-${index}-${RUN.replace('.', '-')}`,
          // The first one already has the photographer.
          ...(index === 0 ? { leadPhotographerId: photographer.id } : {}),
        },
      })
      made.push(booking.id)
    }
    await prisma.$disconnect()

    await signIn(page, 'owner@moments.test', 'owner-dev-2026-moments')
    await page.goto(`/bookings/${made[1]}`)

    await page.getByLabel('Lead photographer').selectOption({ label: 'Studio photographer' })
    await page.getByRole('button', { name: 'Save crew' }).click()

    // The database trigger refuses it, and the message says why in plain words (SEC-A07).
    await expect(
      page.getByText('already holds a confirmed booking on this date'),
    ).toBeVisible()

    const cleanup = new PrismaClient()
    await cleanup.booking.deleteMany({ where: { id: { in: made } } })
    await cleanup.$disconnect()
  })
})
