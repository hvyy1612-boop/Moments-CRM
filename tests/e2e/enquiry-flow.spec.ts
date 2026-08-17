import { test, expect } from '@playwright/test'

const ADMIN_EMAIL = 'owner@moments.test'
const ADMIN_PASSWORD = 'owner-dev-2026-moments'

test('a website enquiry becomes a project', async ({ page }) => {
  await page.goto('/enquire')
  await page.getByLabel('Your name').fill('E2E Enquiry Person')
  await page.getByLabel('Email').fill('e2e-enquiry@moments.test')
  await page.getByLabel('Tell us about your day').fill('Autumn wedding, about 80 guests.')
  await page.getByRole('button', { name: 'Send enquiry' }).click()

  await expect(page.getByText('Thank you, your enquiry is in')).toBeVisible()
})

test('staff quote a project, the client accepts, then signs the contract', async ({ page }) => {
  // Start from a fresh enquiry so this project has no quote yet.
  await page.goto('/enquire')
  await page.getByLabel('Your name').fill('E2E Quote Client')
  await page.getByLabel('Email').fill('e2e-quote@moments.test')
  await page.getByLabel('Tell us about your day').fill('Wedding photography enquiry.')
  await page.getByRole('button', { name: 'Send enquiry' }).click()
  await expect(page.getByText('Thank you, your enquiry is in')).toBeVisible()

  // Staff sign in.
  await page.goto('/login')
  await page.getByLabel('Email').fill(ADMIN_EMAIL)
  await page.getByLabel('Password', { exact: true }).fill(ADMIN_PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/projects$/)

  // Open the newest project for this client.
  await page.getByRole('link', { name: 'E2E Quote Client' }).first().click()
  await expect(page).toHaveURL(/\/projects\/[a-z0-9]+$/)
  const projectUrl = page.url()

  // Build and send a quote.
  await page.getByRole('button', { name: 'Create quote' }).click()
  await page.getByLabel('Description').fill('Wedding photography')
  await page.getByLabel('Quantity').fill('1')
  await page.getByLabel('Unit price').fill('3500')
  await page.getByRole('button', { name: 'Save draft' }).click()
  await expect(page.getByText('Draft saved')).toBeVisible()
  await page.getByRole('button', { name: 'Send to client' }).click()

  // The staff page now shows the private client link.
  const linkText = await page.getByText(/\/quote\//).first().innerText()
  const match = linkText.match(/\/quote\/([A-Za-z0-9_-]+)/)
  expect(match).not.toBeNull()
  const token = match![1]

  // The client opens the quote and accepts it.
  await page.goto(`/quote/${token}`)
  await expect(page.getByText('Your quote')).toBeVisible()
  await expect(page.getByText('$3,500.00').first()).toBeVisible()
  await page.getByLabel('Type your name to accept').fill('Client Name')
  await page.getByRole('button', { name: 'Accept quote' }).click()
  await expect(page.getByText('Thank you, your quote is accepted')).toBeVisible()

  // Staff issue the booking contract from the accepted quote, then send it.
  await page.goto(projectUrl)
  await page.getByRole('button', { name: 'Create contract' }).click()
  await page.getByRole('button', { name: 'Send contract' }).click()

  // The staff page now shows the private contract link.
  const contractLinkText = await page.getByText(/\/contract\//).first().innerText()
  const contractMatch = contractLinkText.match(/\/contract\/([A-Za-z0-9_-]+)/)
  expect(contractMatch).not.toBeNull()
  const contractToken = contractMatch![1]

  // The client opens the contract and signs it, confirming the booking.
  await page.goto(`/contract/${contractToken}`)
  await expect(page.getByText('Your booking contract')).toBeVisible()
  await page.getByLabel('Type your full name to sign').fill('Client Name')
  await page.getByRole('button', { name: 'Sign contract' }).click()
  await expect(page.getByText('Thank you, your contract is signed')).toBeVisible()
})
