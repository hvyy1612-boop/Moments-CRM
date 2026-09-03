'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { CSRF_COOKIE, verifyCsrf } from '@/lib/auth/csrf'
import { getSessionUser } from '@/lib/auth/guard'
import { prisma } from '@/lib/db'

export type OnboardingState =
  | { status: 'idle' }
  | { status: 'error'; message?: string; errors?: { name?: string } }

const nameSchema = z.object({
  name: z.string().trim().min(1, 'Enter your name').max(150, 'Name is too long'),
})

/** Save the staff member's display name and send them into the workspace. */
export async function completeOnboarding(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const cookieStore = await cookies()
  if (!verifyCsrf(cookieStore.get(CSRF_COOKIE)?.value, formData.get('csrf'))) {
    return { status: 'error', message: 'Your session expired. Refresh and try again.' }
  }

  const user = await getSessionUser()
  if (!user) redirect('/login')

  const parsed = nameSchema.safeParse({ name: formData.get('name') })
  if (!parsed.success) {
    return { status: 'error', errors: { name: parsed.error.flatten().fieldErrors.name?.[0] } }
  }

  await prisma.user.update({ where: { id: user.id }, data: { name: parsed.data.name } })
  redirect('/dashboard')
}
