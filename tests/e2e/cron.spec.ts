import { expect, test } from '@playwright/test'
import { PrismaClient } from '@prisma/client'

const SECRET = process.env.CRON_SECRET ?? 'e2e-cron-secret-not-for-production-use'

async function countNotifications(): Promise<number> {
  const prisma = new PrismaClient()
  const count = await prisma.notification.count()
  await prisma.$disconnect()
  return count
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
    const firstBody = await first.json()
    expect(firstBody.status).toBe('ok')

    const afterFirst = await countNotifications()

    const second = await request.post('/api/cron/daily', { headers })
    expect(second.status()).toBe(200)
    const secondBody = await second.json()

    expect(secondBody.quotationRemindersQueued).toBe(0)
    expect(secondBody.preShootRemindersQueued).toBe(0)
    expect(secondBody.invoiceRemindersQueued).toBe(0)
    expect(secondBody.deliverableAlertsQueued).toBe(0)
    expect(secondBody.thankYousQueued).toBe(0)

    const afterSecond = await countNotifications()
    expect(afterSecond).toBe(afterFirst)
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
