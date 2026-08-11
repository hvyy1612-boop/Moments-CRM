import { test, expect } from '@playwright/test'

test('the styleguide renders with no console errors (§12.14)', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', (err) => errors.push(err.message))

  await page.goto('/styleguide')
  await expect(page.getByRole('heading', { level: 1, name: 'Design system' })).toBeVisible()
  await expect(page.getByText('No enquiries yet')).toBeVisible()
  expect(errors).toEqual([])
})
