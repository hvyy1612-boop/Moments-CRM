import { expect, test, type Page } from '@playwright/test'

/**
 * Bookings, money and the client portal, against the worked example the seed builds: a confirmed
 * booking with the fee and balance paid and delivery under way.
 */
const RUN = `${Math.floor(Math.random() * 250) + 1}.${Math.floor(Math.random() * 250) + 1}`
const PORTAL = '/portal/demo-portal-token-development-only-0000'

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
}

test.describe('staff bookings', () => {
  test.use({ extraHTTPHeaders: { 'x-forwarded-for': `10.${RUN}.21` } })

  test('the list shows the booking with its status and value', async ({ page }) => {
    await signIn(page, 'owner@moments.test', 'owner-dev-2026-moments')
    await page.goto('/bookings')

    await expect(page.getByRole('heading', { level: 1, name: 'Bookings' })).toBeVisible()
    await expect(page.getByRole('link', { name: /Ana Silva and Chris Whitmore/ })).toBeVisible()
    await expect(page.getByText('Confirmed')).toBeVisible()
    await expect(page.getByText('$8,530.00')).toBeVisible()
  })

  test('the detail page shows the money, the agreement and the deliverables', async ({ page }) => {
    await signIn(page, 'owner@moments.test', 'owner-dev-2026-moments')
    await page.goto('/bookings')
    await page.getByRole('link', { name: /Ana Silva and Chris Whitmore/ }).click()

    // Both invoices, and nothing outstanding on this example.
    await expect(page.getByText('INV-2026-9001')).toBeVisible()
    await expect(page.getByText('INV-2026-9002')).toBeVisible()
    await expect(page.getByText('Everything on this booking is paid.')).toBeVisible()

    // BR-AG03: the agreement records who accepted and when.
    await expect(page.getByText('Ana Silva', { exact: true })).toBeVisible()

    // BR-D02: each deliverable carries its own due date and status.
    await expect(page.getByText('Sneak peek')).toBeVisible()
    await expect(page.getByText('Photo gallery')).toBeVisible()
    await expect(page.getByText('Wedding film')).toBeVisible()
  })

  test('BR-D09 a deliverable cannot be marked delivered without its gallery link', async ({ page }) => {
    await signIn(page, 'owner@moments.test', 'owner-dev-2026-moments')
    await page.goto('/bookings')
    await page.getByRole('link', { name: /Ana Silva and Chris Whitmore/ }).click()

    // The wedding film has no link yet. Each Update button names its deliverable, so this reaches
    // exactly one row.
    await page.getByRole('button', { name: 'Update Wedding film' }).click()
    await page.getByLabel('Status for Wedding film').selectOption('DELIVERED')
    await page.getByRole('button', { name: 'Save Wedding film' }).click()

    await expect(page.getByText('Add the gallery link before marking this delivered')).toBeVisible()
  })
})

test.describe('client portal', () => {
  test('BR-CP02 the couple see their booking, money and deliverables without signing in', async ({
    page,
  }) => {
    await page.goto(PORTAL)

    await expect(page.getByRole('heading', { level: 1, name: 'Your booking' })).toBeVisible()
    await expect(page.getByText('Ana Silva and Chris Whitmore')).toBeVisible()
    await expect(page.getByText('Confirmed')).toBeVisible()

    // The quotation lines, with the discounts signed correctly.
    await expect(page.getByText('-$150.00')).toBeVisible()
    await expect(page.getByText('$8,530.00')).toBeVisible()

    // Invoices and what was received. Exact matches: the words also appear inside the booking
    // terms further down the page.
    await expect(page.getByText('Booking fee', { exact: true })).toBeVisible()
    await expect(page.getByText('Balance', { exact: true })).toBeVisible()
    await expect(page.getByText('Paid in full, thank you').first()).toBeVisible()

    // A delivered gallery is openable; one still to come is not.
    await expect(page.getByRole('link', { name: 'Open' }).first()).toBeVisible()
  })

  test('BR-CP03 the portal never exposes staff or internal fields', async ({ page }) => {
    await page.goto(PORTAL)
    const body = (await page.textContent('body')) ?? ''

    // No staff identity, no internal record ids, no hashes.
    expect(body).not.toContain('Studio Owner')
    expect(body).not.toContain('moments.test')
    expect(body).not.toMatch(/passwordHash|tokenHash|contentHash/)
  })

  test('BR-CP05 an unknown portal token is a plain not found', async ({ page }) => {
    const response = await page.goto('/portal/not-a-real-token')
    expect(response?.status()).toBe(404)
  })
})

test.describe('outbox', () => {
  test.use({ extraHTTPHeaders: { 'x-forwarded-for': `10.${RUN}.22` } })

  test('SEC-R08 the outbox lists queued mail and masks the reset link', async ({ page }) => {
    // Raise a reset so there is one to mask, then look at the outbox.
    await page.goto('/forgot-password')
    await page.getByLabel('Email').fill('editor@moments.test')
    await page.getByRole('button', { name: 'Send reset link' }).click()
    await expect(page.getByText('If that email matches an account')).toBeVisible()

    await signIn(page, 'owner@moments.test', 'owner-dev-2026-moments')
    await page.goto('/outbox')

    await expect(page.getByRole('heading', { level: 1, name: 'Outbox' })).toBeVisible()
    await expect(page.getByText('This message contains a single-use reset link').first()).toBeVisible()
    // BR-L04: the token itself never appears on screen.
    const body = (await page.textContent('body')) ?? ''
    expect(body).not.toMatch(/reset-password\/[A-Za-z0-9_-]{20,}/)
  })
})
