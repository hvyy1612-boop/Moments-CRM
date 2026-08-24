'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { can } from '@/lib/auth/authz'
import { CSRF_COOKIE, verifyCsrf } from '@/lib/auth/csrf'
import { getSessionUser } from '@/lib/auth/guard'
import { saveCompanyStatusLabels, setProjectStatusByLabel } from '@/lib/domain/status-labels'
import { sanitizeLabels } from './labels'

export async function setProjectStatusAction(formData: FormData): Promise<void> {
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value
  if (!verifyCsrf(cookieValue, formData.get('csrf'))) return

  const user = await getSessionUser()
  if (!user || !can(user, 'PROJECT_EDIT')) throw new Error('Not authorised.')

  const projectId = String(formData.get('projectId') ?? '')
  const labelId = String(formData.get('labelId') ?? '')
  if (!projectId || !labelId) return

  await setProjectStatusByLabel(projectId, labelId, user.id)
  revalidatePath('/projects')
}

export async function saveStatusLabelsAction(formData: FormData): Promise<void> {
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value
  if (!verifyCsrf(cookieValue, formData.get('csrf'))) return

  const user = await getSessionUser()
  if (!user || !can(user, 'PROJECT_EDIT')) throw new Error('Not authorised.')

  let parsed: unknown
  try {
    parsed = JSON.parse(String(formData.get('labels') ?? '[]'))
  } catch {
    return
  }
  const labels = sanitizeLabels(parsed)
  if (labels.length === 0) return

  await saveCompanyStatusLabels(labels)
  revalidatePath('/projects')
}
