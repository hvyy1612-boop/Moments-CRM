'use server'

import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { CSRF_COOKIE, verifyCsrf } from '@/lib/auth/csrf'
import { requestPasswordReset } from '@/lib/auth/password-reset'
import { sendPasswordResetEmail } from '@/lib/email'

async function requestOrigin(): Promise<string> {
  const h = await headers()
  const proto = h.get('x-forwarded-proto') ?? 'https'
  const host = h.get('host') ?? 'localhost:3000'
  return `${proto}://${host}`
}

async function clientIp(): Promise<string> {
  const h = await headers()
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() || '0.0.0.0'
}

/**
 * Request a reset link. Always redirects to the same confirmation, whether or not an account exists,
 * so the response never reveals which emails are registered (OWASP account-existence protection).
 */
export async function requestResetAction(formData: FormData): Promise<void> {
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value
  if (verifyCsrf(cookieValue, formData.get('csrf'))) {
    const email = String(formData.get('email') ?? '').trim().toLowerCase()
    if (email) {
      const ip = await clientIp()
      const result = await requestPasswordReset(email, ip)
      if (result) {
        const origin = await requestOrigin()
        await sendPasswordResetEmail({ to: email, resetLink: `${origin}/reset/${result.token}` })
      }
    }
  }
  redirect('/forgot?sent=1')
}
