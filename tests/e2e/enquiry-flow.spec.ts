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

test('full lifecycle: quote, contract, booking, double-booking blocked, deposit invoiced and paid', async ({
  page,
}) => {
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

  // The project is now CONFIRMED, so scheduling opens. Book a shoot and staff it.
  await page.goto(projectUrl)
  await page.getByLabel('What is this shoot?').fill('Wedding day')
  await page.getByLabel('Starts').fill('2026-11-14T14:00')
  await page.getByLabel('Ends').fill('2026-11-14T18:00')
  await page.getByRole('button', { name: 'Schedule shoot' }).click()
  await expect(page.getByText('Wedding day')).toBeVisible()

  await page.getByLabel('Resource').first().selectOption({ label: 'Lead Photographer' })
  await page.getByRole('button', { name: 'Assign' }).first().click()
  await expect(page.getByText('No crew assigned yet')).toHaveCount(0)

  // A second, overlapping shoot: the same photographer must not be double-booked.
  await page.getByLabel('What is this shoot?').fill('Reception')
  await page.getByLabel('Starts').fill('2026-11-14T16:00')
  await page.getByLabel('Ends').fill('2026-11-14T20:00')
  await page.getByRole('button', { name: 'Schedule shoot' }).click()
  await expect(page.getByText('Reception')).toBeVisible()

  await page.getByLabel('Resource').nth(1).selectOption({ label: 'Lead Photographer' })
  await page.getByRole('button', { name: 'Assign' }).nth(1).click()
  await expect(page.getByText('already booked for an overlapping time')).toBeVisible()

  // Raise a deposit invoice, issue it, and record the payment in full.
  await page.getByLabel('Amount (incl. GST)').fill('700')
  await page.getByLabel('Description').fill('Booking deposit')
  await page.getByRole('button', { name: 'Raise invoice' }).click()
  await page.getByRole('button', { name: 'Issue invoice' }).click()

  await page.getByLabel('Payment amount').fill('700')
  await page.getByRole('button', { name: 'Record' }).click()
  await expect(page.getByText('paid', { exact: true })).toBeVisible()
})
