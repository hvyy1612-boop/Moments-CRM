'use server'

import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { appBaseUrl } from '@/lib/app-url'
import { CSRF_COOKIE, verifyCsrf } from '@/lib/auth/csrf'
import { requestPasswordReset } from '@/lib/auth/password-reset'
import { sendPasswordResetEmail } from '@/lib/email'

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
        const origin = await appBaseUrl()
        await sendPasswordResetEmail({ to: email, resetLink: `${origin}/reset/${result.token}` })
      }
    }
  }
  redirect('/forgot?sent=1')
}
