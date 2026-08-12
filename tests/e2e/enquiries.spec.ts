import { expect, test, type Page } from '@playwright/test'

/**
 * The staff enquiry screens: list, detail, timeline and the workflow actions.
 *
 * Each describe block signs in from its own forwarded address so the per-IP login limiter
 * (SEC-S04) cannot make one group affect another.
 */
const RUN = `${Math.floor(Math.random() * 250) + 1}.${Math.floor(Math.random() * 250) + 1}`

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
}

test.describe('enquiry list', () => {
  test.use({ extraHTTPHeaders: { 'x-forwarded-for': `10.${RUN}.11` } })

  test('BR-E07 the list shows every enquiry and names the overdue ones in words', async ({ page }) => {
    await signIn(page, 'owner@moments.test', 'owner-dev-2026-moments')
    await page.goto('/enquiries')

    await expect(page.getByRole('heading', { level: 1, name: 'Enquiries' })).toBeVisible()
    await expect(page.getByRole('link', { name: /Harper Nguyen/ })).toBeVisible()
    await expect(page.getByRole('link', { name: /Dani Kaur/ })).toBeVisible()

    // Seeded at 50 and 30 hours old: one escalated, one alerting. §10.3 requires words, not colour.
    await expect(page.getByText('Overdue, past 48 hours')).toBeVisible()
    await expect(page.getByText('Overdue, past 24 hours')).toBeVisible()
  })

  test('the status filter narrows the list and keeps an honest empty state', async ({ page }) => {
    await signIn(page, 'owner@moments.test', 'owner-dev-2026-moments')

    await page.goto('/enquiries?status=LOST')
    await expect(page.getByRole('link', { name: /Priya Sharma/ })).toBeVisible()
    await expect(page.getByRole('link', { name: /Harper Nguyen/ })).toHaveCount(0)

    // WON holds the worked example the seed builds, so the empty state is proven on a status that
    // genuinely has nothing in it.
    await page.goto('/enquiries?status=WON')
    await expect(page.getByRole('link', { name: /Ana Silva/ })).toBeVisible()

    await page.goto('/enquiries?status=QUOTED')
    await expect(page.getByText('No quoted enquiries')).toBeVisible()
  })

  test('the dashboard leads with what needs attention today (§10.4)', async ({ page }) => {
    await signIn(page, 'owner@moments.test', 'owner-dev-2026-moments')
    await expect(
      page.getByRole('heading', { level: 1, name: 'What needs attention today' }),
    ).toBeVisible()
    await expect(page.getByText('past the 24 hour commitment')).toBeVisible()
  })
})

test.describe('enquiry detail and workflow', () => {
  test.use({ extraHTTPHeaders: { 'x-forwarded-for': `10.${RUN}.12` } })

  test('BR-E06 marking contacted records the response once and writes the timeline', async ({
    page,
  }) => {
    await signIn(page, 'owner@moments.test', 'owner-dev-2026-moments')
    await page.goto('/enquiries?status=NEW')
    await page.getByRole('link', { name: /Sione Faletau/ }).click()

    await expect(page.getByRole('heading', { level: 1, name: /Sione Faletau/ })).toBeVisible()
    await expect(page.getByText('Curzon Hall')).toBeVisible()
    // PRIV-02: consent state is stated plainly on the client panel.
    await expect(page.getByText('No marketing consent')).toBeVisible()
    // PRIV-04: opening the record is itself logged, so it appears in the timeline.
    await expect(page.getByText('Client record opened')).toBeVisible()

    await page.getByRole('button', { name: 'Mark as contacted' }).click()

    await expect(page.getByText('Contacted', { exact: true })).toBeVisible()
    await expect(page.getByText('Marked as contacted')).toBeVisible()
    // BR-E06: once contacted the action is gone, so the timestamp cannot be set twice.
    await expect(page.getByRole('button', { name: 'Mark as contacted' })).toHaveCount(0)
    await expect(page.getByText('Overdue, past 24 hours')).toHaveCount(0)
  })

  test('BR-E10 marking lost asks first, takes a reason from the fixed list, and records it', async ({
    page,
  }) => {
    await signIn(page, 'owner@moments.test', 'owner-dev-2026-moments')
    await page.goto('/enquiries?status=NEW')
    await page.getByRole('link', { name: /Dani Kaur/ }).click()

    const reason = page.getByLabel('Reason lost')
    await expect(reason).toBeVisible()
    // A closed set: the control offers only the fixed list, never free text.
    await expect(reason.locator('option')).toHaveCount(6)
    await reason.selectOption('Budget')

    // One click does not close the enquiry: it asks, and cancelling leaves the status alone.
    await page.getByRole('button', { name: 'Mark as lost' }).click()
    await expect(page.getByText('Mark this enquiry as lost?')).toBeVisible()
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByText('Mark this enquiry as lost?')).toHaveCount(0)
    await expect(page.getByText('Lost', { exact: true })).toHaveCount(0)

    await page.getByRole('button', { name: 'Mark as lost' }).click()
    await page.getByRole('button', { name: 'Yes, mark as lost' }).click()

    await expect(page.getByText('Lost', { exact: true })).toBeVisible()
    await expect(page.getByText('Marked as lost: Budget')).toBeVisible()
  })

  test('a lost enquiry can have its reason corrected and can be reopened', async ({ page }) => {
    await signIn(page, 'owner@moments.test', 'owner-dev-2026-moments')
    await page.goto('/enquiries?status=LOST')
    await page.getByRole('link', { name: /Priya Sharma/ }).click()

    // The reason is correctable in place, and both values reach the timeline.
    await expect(page.getByText('Reason: Date unavailable.')).toBeVisible()
    await page.getByLabel('Change reason').selectOption('Budget')
    await page.getByRole('button', { name: 'Save reason' }).click()
    await expect(page.getByText('Reason lost changed: Date unavailable to Budget')).toBeVisible()

    // Reopening returns it to the working list. This enquiry was answered, so it goes back to
    // CONTACTED, and nothing is erased: the earlier correction is still in the timeline
    // (BR-L01 insert-only).
    await page.getByRole('button', { name: 'Reopen enquiry' }).click()
    await expect(page.getByText('Contacted', { exact: true })).toBeVisible()
    await expect(page.getByText('Reopened after being marked lost: back to contacted')).toBeVisible()
    await expect(page.getByText('Reason lost changed: Date unavailable to Budget')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Reopen enquiry' })).toHaveCount(0)
  })

  test('assigning an enquiry names the assignee on the list and in the timeline', async ({ page }) => {
    await signIn(page, 'owner@moments.test', 'owner-dev-2026-moments')
    await page.goto('/enquiries')
    await page.getByRole('link', { name: /Alex Romano/ }).click()

    await page.getByLabel('Assigned to').selectOption({ label: 'Photographer' })
    await page.getByRole('button', { name: 'Save assignment' }).click()

    await expect(page.getByText('Assigned: to Photographer')).toBeVisible()
    await page.goto('/enquiries?status=CONTACTED')
    await expect(page.getByText('Photographer')).toBeVisible()
  })

  test('SEC-A07 an unknown enquiry id is a plain not found, never a leak', async ({ page }) => {
    await signIn(page, 'owner@moments.test', 'owner-dev-2026-moments')
    const response = await page.goto('/enquiries/does-not-exist')
    expect(response?.status()).toBe(404)
  })
})

test.describe('role boundary', () => {
  test.use({ extraHTTPHeaders: { 'x-forwarded-for': `10.${RUN}.13` } })

  test('SEC-A01 an editor cannot reach enquiries and is not shown the link (§5)', async ({ page }) => {
    await signIn(page, 'editor@moments.test', 'editor-dev-2026-moments')

    // §5: EDITOR is limited to assigned deliverables, so no enquiry navigation is offered.
    await expect(page.getByRole('link', { name: 'Enquiries' })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Your deliverables' })).toBeVisible()

    // Deny by default holds even when the URL is typed directly. A signed-in user with the wrong
    // role gets a plain not found, never a hint that the area exists (D-024, SEC-A07).
    const denied = await page.goto('/enquiries')
    expect(denied?.status()).toBe(404)
    await expect(page.getByRole('link', { name: /Harper Nguyen/ })).toHaveCount(0)
  })
})
