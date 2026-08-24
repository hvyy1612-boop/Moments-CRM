'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { can } from '@/lib/auth/authz'
import { CSRF_COOKIE, verifyCsrf } from '@/lib/auth/csrf'
import { getSessionUser } from '@/lib/auth/guard'
import { setProjectLifecycle } from '@/lib/domain/project'
import { isLifecycle } from './lifecycle'

export async function setProjectStatusAction(formData: FormData): Promise<void> {
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value
  if (!verifyCsrf(cookieValue, formData.get('csrf'))) return

  const user = await getSessionUser()
  if (!user || !can(user, 'PROJECT_EDIT')) throw new Error('Not authorised.')

  const projectId = String(formData.get('projectId') ?? '')
  const status = String(formData.get('status') ?? '')
  if (!projectId || !isLifecycle(status)) return

  await setProjectLifecycle(projectId, status, user.id)
  revalidatePath('/projects')
}
