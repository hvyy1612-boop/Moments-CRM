'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { CSRF_COOKIE, verifyCsrf } from '@/lib/auth/csrf'
import { registerUser } from '@/lib/auth/register'
import { registerSchema } from '@/lib/validation/register'

export type RegisterFormState =
  | { status: 'idle' }
  | { status: 'error'; message?: string; errors?: { name?: string; email?: string; password?: string } }

export async function register(
  _prev: RegisterFormState,
  formData: FormData,
): Promise<RegisterFormState> {
  const cookieStore = await cookies()
  if (!verifyCsrf(cookieStore.get(CSRF_COOKIE)?.value, formData.get('csrf'))) {
    return { status: 'error', message: 'Your session expired. Refresh and try again.' }
  }

  const parsed = registerSchema.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
    password: formData.get('password'),
  })
  if (!parsed.success) {
    const f = parsed.error.flatten().fieldErrors
    return {
      status: 'error',
      errors: { name: f.name?.[0], email: f.email?.[0], password: f.password?.[0] },
    }
  }

  const result = await registerUser(parsed.data)
  if (!result.ok) return { status: 'error', message: result.error }
  redirect('/login?registered=1')
}
