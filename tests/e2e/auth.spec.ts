import { expect, test } from '@playwright/test'
import { PrismaClient } from '@prisma/client'

const RUN = `${Math.floor(Math.random() * 250) + 1}.${Math.floor(Math.random() * 250) + 1}`
const GENERIC = 'Email or password is incorrect.'

test.describe('security headers', () => {
  test('SEC-A05 every page response carries the strict header set', async ({ page }) => {
    const response = await page.goto('/login')
    expect(response).not.toBeNull()
    const headers = response!.headers()
    expect(headers['content-security-policy']).toContain("default-src 'self'")
    expect(headers['content-security-policy']).toContain('strict-dynamic')
    expect(headers['x-frame-options']).toBe('DENY')
    expect(headers['x-content-type-options']).toBe('nosniff')
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin')
    expect(headers['permissions-policy']).toContain('camera=()')
  })
})

test.describe('generic failure', () => {
  test.use({ extraHTTPHeaders: { 'x-forwarded-for': `10.${RUN}.1` } })

  test('SEC-S05 a wrong password and an unknown account return the identical message', async ({
    page,
  }) => {
    await page.goto('/login')
    await page.getByLabel('Email').fill('owner@moments.test')
    await page.getByLabel('Password', { exact: true }).fill('definitely-not-the-password')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByText(GENERIC)).toBeVisible()

    await page.goto('/login')
    await page.getByLabel('Email').fill('nobody@nowhere.test')
    await page.getByLabel('Password', { exact: true }).fill('whatever-password-here')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByText(GENERIC)).toBeVisible()
  })
})

test.describe('password login', () => {
  test.use({ extraHTTPHeaders: { 'x-forwarded-for': `10.${RUN}.2` } })

  test('SEC-S01 to SEC-S03 sign in works, the cookie is hardened, sign out revokes', async ({
    page,
    context,
  }) => {
    await page.goto('/login')
    await page.getByLabel('Email').fill('owner@moments.test')
    await page.getByLabel('Password', { exact: true }).fill('owner-dev-2026-moments')
    await page.getByRole('button', { name: 'Sign in' }).click()

    await expect(page).toHaveURL(/\/dashboard$/)
    await expect(page.getByText('Studio Owner · ADMIN')).toBeVisible()

    const session = (await context.cookies()).find((c) => c.name === 'moments_session')
    expect(session).toBeDefined()
    expect(session!.httpOnly).toBe(true)
    expect(session!.sameSite).toBe('Strict')

    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page).toHaveURL(/\/login$/)

    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/login$/)
  })

  test('§8.5 the show/hide toggle reveals and hides the password', async ({ page }) => {
    await page.goto('/login')
    const password = page.getByLabel('Password', { exact: true })
    await password.fill('something-secret')
    await expect(password).toHaveAttribute('type', 'password')
    await page.getByRole('button', { name: 'Show password' }).click()
    await expect(password).toHaveAttribute('type', 'text')
    await page.getByRole('button', { name: 'Hide password' }).click()
    await expect(password).toHaveAttribute('type', 'password')
  })
})

test.describe('google absent', () => {
  test('BR-G11 with no Google environment there is no Google button and no OR divider', async ({
    page,
  }) => {
    await page.goto('/login')
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
    await expect(page.getByText('OR', { exact: true })).toHaveCount(0)
    await expect(page.getByText('Google')).toHaveCount(0)

    await expect(page.getByText(/sign up/i)).toHaveCount(0)
  })
})

test.describe('lockout', () => {
  test.use({ extraHTTPHeaders: { 'x-forwarded-for': `10.${RUN}.3` } })

  test('SEC-S04 five failures lock the account and the correct password then fails generically', async ({
    page,
  }) => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await page.goto('/login')
      await page.getByLabel('Email').fill('lockout@moments.test')
      await page.getByLabel('Password', { exact: true }).fill(`wrong-password-${attempt}`)
      await page.getByRole('button', { name: 'Sign in' }).click()
      await expect(page.getByText(GENERIC)).toBeVisible()
    }

    await page.goto('/login')
    await page.getByLabel('Email').fill('lockout@moments.test')
    await page.getByLabel('Password', { exact: true }).fill('lockout-dev-2026-moments')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByText(GENERIC)).toBeVisible()
    await expect(page).toHaveURL(/\/login$/)
  })
})

test.describe('password reset', () => {
  test.use({ extraHTTPHeaders: { 'x-forwarded-for': `10.${RUN}.4` } })

  test('SEC-R01 to SEC-R06 request, identical confirmation, consume once, sessions carry the new password', async ({
    page,
  }) => {

    await page.goto('/forgot-password')
    await page.getByLabel('Email').fill('reset@moments.test')
    await page.getByRole('button', { name: 'Send reset link' }).click()
    const confirmation = page.getByText('If that email matches an account')
    await expect(confirmation).toBeVisible()

    await page.goto('/forgot-password')
    await page.getByLabel('Email').fill('ghost@nowhere.test')
    await page.getByRole('button', { name: 'Send reset link' }).click()
    await expect(page.getByText('If that email matches an account')).toBeVisible()

    const prisma = new PrismaClient()
    const notification = await prisma.notification.findFirst({
      where: { recipient: 'reset@moments.test', templateKey: 'auth.password-reset' },
      orderBy: { createdAt: 'desc' },
    })
    await prisma.$disconnect()
    expect(notification).not.toBeNull()
    const match = notification!.bodyText.match(/\/reset-password\/[A-Za-z0-9_-]+/)
    expect(match).not.toBeNull()

    await page.goto(match![0])
    await page.getByLabel('New password', { exact: true }).fill('reset-updated-2026-moments')
    await page.getByLabel('Confirm new password').fill('reset-updated-2026-moments')
    await page.getByRole('button', { name: 'Set new password' }).click()
    await expect(page).toHaveURL(/\/login\?reset=done$/)
    await expect(page.getByText('Your password has been updated')).toBeVisible()

    await page.goto(match![0])
    await page.getByLabel('New password', { exact: true }).fill('another-attempt-2026-pass')
    await page.getByLabel('Confirm new password').fill('another-attempt-2026-pass')
    await page.getByRole('button', { name: 'Set new password' }).click()
    await expect(page.getByText('This reset link is no longer valid.')).toBeVisible()

    await page.goto('/login')
    await page.getByLabel('Email').fill('reset@moments.test')
    await page.getByLabel('Password', { exact: true }).fill('reset-updated-2026-moments')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page).toHaveURL(/\/dashboard$/)
    await expect(page.getByText('Reset test account (dev only) · EDITOR')).toBeVisible()
  })

  test('SEC-P04 a reset to a short password is refused with a field error', async ({ page }) => {
    await page.goto('/reset-password/not-a-real-token')
    await page.getByLabel('New password', { exact: true }).fill('short')
    await page.getByLabel('Confirm new password').fill('short')
    await page.getByRole('button', { name: 'Set new password' }).click()
    await expect(page.getByText('Use at least 12 characters.')).toBeVisible()
  })
})
