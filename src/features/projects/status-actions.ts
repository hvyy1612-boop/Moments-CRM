'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { can } from '@/lib/auth/authz'
import { CSRF_COOKIE, verifyCsrf } from '@/lib/auth/csrf'
import { getSessionUser } from '@/lib/auth/guard'
import { saveCompanyStatusLabels, setProjectStatusByLabel } from '@/lib/domain/status-labels'
import { sanitizeLabels } from './labels'

/**
 * Move a project to a status label from the board's inline picker. Deny-by-default: the write is
 * gated on PROJECT_EDIT on the server, never on the menu's shown/hidden state. A bad value or a
 * stale CSRF token is a silent no-op — the re-render shows the real state either way.
 */
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

/** Save the company's curated status-label set (Edit Labels). Gated on PROJECT_EDIT. */
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
