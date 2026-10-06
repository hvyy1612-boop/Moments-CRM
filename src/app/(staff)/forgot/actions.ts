'use server'

import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { appBaseUrl } from '@/lib/app-url'
import { CSRF_COOKIE, verifyCsrf } from '@/lib/auth/csrf'
import { requestPasswordReset } from '@/lib/auth/password-reset'
import { isInternalLoginId } from '@/lib/auth/staff'
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
    // An app-issued login ID (s264831@staff.moments.com ...) is not a mailbox, and moments.com is not the
    // studio's domain: a reset link must never be mailed there. Staff ask an admin to reset it in Users;
    // the page shows the same confirmation either way.
    if (email && !isInternalLoginId(email)) {
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
