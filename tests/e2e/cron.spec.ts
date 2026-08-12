import { expect, test } from '@playwright/test'
import { PrismaClient } from '@prisma/client'

/**
 * The nightly job (obligation C of §2.0), tested against the real database rather than a mock.
 *
 * Its safety property is BR-X08: running it twice must change nothing the second time. That is
 * exactly what a mock cannot prove convincingly, so this drives the real endpoint and counts the
 * rows it actually wrote.
 */
const SECRET = process.env.CRON_SECRET ?? 'e2e-cron-secret-not-for-production-use'

/**
 * The duplicates BR-X08 forbids: the same template raised twice against the same record. Counting
 * these rather than counting all notifications makes the assertion immune to other specs creating
 * bookings while this one runs, which is real interference and not a rule being broken.
 */
async function duplicateReminders(): Promise<string[]> {
  const prisma = new PrismaClient()
  const grouped = await prisma.notification.groupBy({
    by: ['templateKey', 'relatedType', 'relatedId'],
    where: { status: { in: ['QUEUED', 'SENT'] } },
    _count: { _all: true },
  })
  await prisma.$disconnect()
  return grouped
    .filter((row) => row._count._all > 1)
    .map((row) => `${row.templateKey} on ${row.relatedType} ${row.relatedId} x${row._count._all}`)
}

test.describe('the daily job', () => {
  test('SEC-A06 the endpoint is closed without the shared secret', async ({ request }) => {
    const anonymous = await request.post('/api/cron/daily')
    expect(anonymous.status()).toBe(401)

    const wrong = await request.post('/api/cron/daily', {
      headers: { authorization: 'Bearer not-the-secret' },
    })
    expect(wrong.status()).toBe(401)
  })

  test('BR-X08 running it twice queues nothing twice', async ({ request }) => {
    const headers = { authorization: `Bearer ${SECRET}` }

    const first = await request.post('/api/cron/daily', { headers })
    expect(first.status()).toBe(200)
    expect((await first.json()).status).toBe('ok')

    // Run it three more times. Whatever else is happening in the database, the job must never
    // raise the same reminder twice against the same record.
    for (let run = 0; run < 3; run += 1) {
      const again = await request.post('/api/cron/daily', { headers })
      expect(again.status()).toBe(200)
    }

    expect(await duplicateReminders()).toEqual([])
  })

  test('BR-F the job reaches the outbox with real reminders', async ({ request, page }) => {
    await request.post('/api/cron/daily', { headers: { authorization: `Bearer ${SECRET}` } })

    await page.goto('/login')
    await page.getByLabel('Email').fill('owner@moments.test')
    await page.getByLabel('Password', { exact: true }).fill('owner-dev-2026-moments')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page).toHaveURL(/\/dashboard$/)

    await page.goto('/outbox')
    // The worked example is delivered and paid, so the thank-you is the reminder it earns
    // (BR-F07). Its presence proves the job wrote through to something a person can see.
    await expect(page.getByText('Thank you').first()).toBeVisible()
  })
})
