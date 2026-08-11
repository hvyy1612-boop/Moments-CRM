import { test, expect } from '@playwright/test'

test('GET /api/health returns 200 and reports the database up (§12.16)', async ({ request }) => {
  const res = await request.get('/api/health')
  expect(res.status()).toBe(200)
  expect(await res.json()).toMatchObject({ status: 'ok', database: 'up' })
})
