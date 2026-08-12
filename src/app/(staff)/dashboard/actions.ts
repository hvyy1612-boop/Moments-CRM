'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { CSRF_COOKIE, verifyCsrf } from '@/lib/auth/csrf'
import { revokeSessionByToken, SESSION_COOKIE } from '@/lib/auth/session'

export async function signOut(formData: FormData): Promise<void> {
  const cookieStore = await cookies()

  if (!verifyCsrf(cookieStore.get(CSRF_COOKIE)?.value, formData.get('csrf'))) {
    redirect('/login')
  }

  const token = cookieStore.get(SESSION_COOKIE)?.value
  if (token) await revokeSessionByToken(token)
  cookieStore.delete(SESSION_COOKIE)
  redirect('/login')
}
