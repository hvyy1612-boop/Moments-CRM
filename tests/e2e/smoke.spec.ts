import { expect, test } from '@playwright/test'

test('home page renders a heading with no console errors (§12.14)', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })

  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  expect(errors).toEqual([])
})

test('the public front door leads to the enquiry form and hides everything internal', async ({
  page,
}) => {
  await page.goto('/')

  await expect(page.getByRole('link', { name: 'Check your date' }).first()).toBeVisible()
  await page.getByRole('link', { name: 'Check your date' }).first().click()
  await expect(page).toHaveURL(/\/enquire$/)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

  await page.goto('/')
  const hrefs = await page.locator('a').evaluateAll((links) =>
    links.map((link) => link.getAttribute('href') ?? ''),
  )
  expect(hrefs.some((href) => href.startsWith('/styleguide'))).toBe(false)
  expect(hrefs.some((href) => href.startsWith('/api/'))).toBe(false)
  expect(hrefs.some((href) => href.startsWith('/dashboard'))).toBe(false)
})

test('REC-W3 the front door quotes "from" prices, never a fixed final price', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByText(/from \$3,500\.00/)).toBeVisible()
  await expect(page.getByText('Prices include GST')).toBeVisible()
})
