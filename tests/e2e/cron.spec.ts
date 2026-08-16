import { expect, test } from '@playwright/test'
import { PrismaClient } from '@prisma/client'

const SECRET = process.env.CRON_SECRET ?? 'e2e-cron-secret-not-for-production-use'

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

    await expect(page.getByText('Thank you').first()).toBeVisible()
  })
})
