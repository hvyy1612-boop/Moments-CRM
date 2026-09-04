'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { CSRF_COOKIE, verifyCsrf } from '@/lib/auth/csrf'
import { getSessionUser } from '@/lib/auth/guard'
import { checkPasswordPolicy, hashPassword } from '@/lib/auth/password'
import { prisma } from '@/lib/db'

export type ChangePasswordState =
  | { status: 'idle' }
  | { status: 'error'; message?: string; errors?: { password?: string; confirm?: string } }

export async function changePassword(
  _prev: ChangePasswordState,
  formData: FormData,
): Promise<ChangePasswordState> {
  const cookieStore = await cookies()
  if (!verifyCsrf(cookieStore.get(CSRF_COOKIE)?.value, formData.get('csrf'))) {
    return { status: 'error', message: 'Your session expired. Refresh and try again.' }
  }

  const user = await getSessionUser()
  if (!user) redirect('/login')

  const password = String(formData.get('password') ?? '')
  const confirm = String(formData.get('confirm') ?? '')

  if (checkPasswordPolicy(password)) {
    return { status: 'error', errors: { password: 'Choose a password of at least 12 characters that is not commonly used.' } }
  }
  if (password !== confirm) {
    return { status: 'error', errors: { confirm: 'The two passwords do not match.' } }
  }

  const hashed = await hashPassword(password)
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: hashed.hash, passwordAlgo: hashed.algo, mustChangePassword: false },
  })
  redirect('/dashboard')
}
