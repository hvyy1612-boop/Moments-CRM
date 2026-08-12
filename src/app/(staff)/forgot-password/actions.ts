'use server'

import { cookies } from 'next/headers'
import { CSRF_COOKIE, verifyCsrf } from '@/lib/auth/csrf'
import { requestPasswordReset } from '@/lib/auth/password-reset'
import { requestMeta } from '@/lib/http'
import { forgotPasswordSchema } from '@/lib/validation/auth'

export type ForgotPasswordState =
  | { status: 'idle' }
  | { status: 'sent' }
  | { status: 'error'; errors?: { email?: string } }

export async function requestReset(
  _prev: ForgotPasswordState,
  formData: FormData,
): Promise<ForgotPasswordState> {
  const cookieStore = await cookies()
  if (!verifyCsrf(cookieStore.get(CSRF_COOKIE)?.value, formData.get('csrf'))) {
    // A forged post gets the same confirmation as everyone else; nothing to probe (SEC-R01).
    return { status: 'sent' }
  }

  const parsed = forgotPasswordSchema.safeParse({ email: formData.get('email') })
  if (!parsed.success) {
    return { status: 'error', errors: { email: parsed.error.flatten().fieldErrors.email?.[0] } }
  }

  // SEC-R01/R03: same path either way, nothing on the account changes, identical confirmation.
  await requestPasswordReset(parsed.data.email, await requestMeta())
  return { status: 'sent' }
}
