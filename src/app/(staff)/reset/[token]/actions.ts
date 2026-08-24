'use server'

import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { CSRF_COOKIE, verifyCsrf } from '@/lib/auth/csrf'
import { resetPassword } from '@/lib/auth/password-reset'

async function clientIp(): Promise<string> {
  const h = await headers()
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() || '0.0.0.0'
}

export async function resetPasswordAction(formData: FormData): Promise<void> {
  const token = String(formData.get('token') ?? '')
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value
  if (!verifyCsrf(cookieValue, formData.get('csrf'))) {
    redirect(`/reset/${encodeURIComponent(token)}?error=invalid`)
  }
  const password = String(formData.get('password') ?? '')
  const result = await resetPassword(token, password, await clientIp())
  if (result.ok) {
    redirect('/login?reset=done')
  }
  redirect(`/reset/${encodeURIComponent(token)}?error=${result.reason}`)
}
