'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { CSRF_COOKIE, verifyCsrf } from '@/lib/auth/csrf'
import { attemptLogin } from '@/lib/auth/login'
import { REMEMBER_TIMEOUT_MS, revokeSessionByToken, SESSION_COOKIE } from '@/lib/auth/session'
import { requestMeta } from '@/lib/http'
import { loginSchema } from '@/lib/validation/auth'

export type LoginFormState =
  | { status: 'idle' }
  | { status: 'error'; message?: string; errors?: { email?: string; password?: string } }

const GENERIC_FAILURE = 'Email or password is incorrect.'

export async function signIn(_prev: LoginFormState, formData: FormData): Promise<LoginFormState> {
  const cookieStore = await cookies()

  if (!verifyCsrf(cookieStore.get(CSRF_COOKIE)?.value, formData.get('csrf'))) {
    return { status: 'error', message: GENERIC_FAILURE }
  }

  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    remember: formData.get('remember') ?? undefined,
  })
  if (!parsed.success) {
    const fields = parsed.error.flatten().fieldErrors
    return {
      status: 'error',
      errors: { email: fields.email?.[0], password: fields.password?.[0] },
    }
  }

  const meta = await requestMeta()
  const result = await attemptLogin(
    {
      email: parsed.data.email,
      password: parsed.data.password,
      remember: parsed.data.remember === 'on',
    },
    meta,
  )
  if (!result.ok) {
    return { status: 'error', message: GENERIC_FAILURE }
  }

  const existing = cookieStore.get(SESSION_COOKIE)?.value
  if (existing) await revokeSessionByToken(existing)

  cookieStore.set(SESSION_COOKIE, result.session.token, {
    httpOnly: true, // SEC-S01
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',

    ...(parsed.data.remember === 'on' ? { maxAge: REMEMBER_TIMEOUT_MS / 1000 } : {}),
  })

  redirect('/projects')
}
