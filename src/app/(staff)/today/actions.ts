'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { can } from '@/lib/auth/authz'
import { CSRF_COOKIE, verifyCsrf } from '@/lib/auth/csrf'
import { getSessionUser } from '@/lib/auth/guard'
import { prisma } from '@/lib/db'
import { toggleEnquiryTask } from '@/lib/domain/enquiry-workflow'
import { toggleProjectTask } from '@/lib/domain/project-workflow'

export async function markTaskDoneAction(formData: FormData): Promise<void> {
  const user = await getSessionUser()
  if (!user) throw new Error('Not authorised.')
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value
  if (!verifyCsrf(cookieValue, formData.get('csrf'))) throw new Error('Invalid request.')

  const taskId = String(formData.get('taskId') ?? '')
  if (!taskId) return
  const wi = await prisma.workItem.findUnique({ where: { id: taskId }, select: { enquiryId: true, projectId: true } })
  if (!wi) return

  if (wi.enquiryId) {
    if (!can(user, 'ENQUIRY_CONVERT')) throw new Error('Not authorised.')
    await toggleEnquiryTask(taskId, user.id)
  } else if (wi.projectId) {
    if (!can(user, 'PROJECT_EDIT')) throw new Error('Not authorised.')
    await toggleProjectTask(taskId, user.id)
  }
  revalidatePath('/today')
  revalidatePath('/calendar')
}
