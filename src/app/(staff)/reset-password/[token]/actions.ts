'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { CSRF_COOKIE, verifyCsrf } from '@/lib/auth/csrf'
import { completePasswordReset } from '@/lib/auth/password-reset'
import { requestMeta } from '@/lib/http'
import { resetPasswordSchema } from '@/lib/validation/auth'

export type ResetPasswordState =
  | { status: 'idle' }
  | {
      status: 'error'
      message?: string
      errors?: { password?: string; confirmPassword?: string }
    }

const INVALID_LINK = 'This reset link is no longer valid.'

export async function completeReset(
  _prev: ResetPasswordState,
  formData: FormData,
): Promise<ResetPasswordState> {
  const cookieStore = await cookies()
  if (!verifyCsrf(cookieStore.get(CSRF_COOKIE)?.value, formData.get('csrf'))) {
    return { status: 'error', message: INVALID_LINK }
  }

  const parsed = resetPasswordSchema.safeParse({
    password: formData.get('password'),
    confirmPassword: formData.get('confirmPassword'),
  })
  if (!parsed.success) {
    const fields = parsed.error.flatten().fieldErrors
    return {
      status: 'error',
      errors: {
        password: fields.password?.[0],
        confirmPassword: fields.confirmPassword?.[0],
      },
    }
  }

  const token = formData.get('token')
  if (typeof token !== 'string' || token.length === 0) {
    return { status: 'error', message: INVALID_LINK }
  }

  const outcome = await completePasswordReset(token, parsed.data.password, await requestMeta())
  if (outcome === 'too_short') {
    return { status: 'error', errors: { password: 'Use at least 12 characters.' } }
  }
  if (outcome === 'too_common') {
    return {
      status: 'error',
      errors: { password: 'That password is too common. Choose something more unusual.' },
    }
  }
  if (outcome === 'invalid') {

    return { status: 'error', message: INVALID_LINK }
  }

  redirect('/login?reset=done')
}
