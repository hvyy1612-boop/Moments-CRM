'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { can } from '@/lib/auth/authz'
import { CSRF_COOKIE, verifyCsrf } from '@/lib/auth/csrf'
import { getSessionUser } from '@/lib/auth/guard'
import { advanceEnquiry, convertEnquiry, createEnquiry, markEnquiryLost, reopenEnquiry } from '@/lib/domain/enquiry'
import { enquirySchema } from '@/lib/validation/enquiry'
import {
  addEnquiryTask,
  deleteEnquiryTask,
  logClientReply,
  moveEnquiryTask,
  sendStaffReply,
  startQuoting,
  toggleEnquiryTask,
  updateEnquiryTask,
} from '@/lib/domain/enquiry-workflow'
import { seedProjectWorkflow } from '@/lib/domain/project-workflow'

async function requireStaff() {
  const user = await getSessionUser()
  if (!user || !can(user, 'ENQUIRY_CONVERT')) {
    throw new Error('Not authorised.')
  }
  return user
}

async function csrfOk(formData: FormData): Promise<boolean> {
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value
  return verifyCsrf(cookieValue, formData.get('csrf'))
}

export type AddEnquiryState =
  | { status: 'idle' }
  | { status: 'error'; message?: string; errors?: { name?: string; email?: string } }
  | { status: 'created'; enquiryId: string }

/** Staff adds a REAL Enquiry (a lead). It appears immediately in /enquiries with its seeded workflow. */
export async function addEnquiryAction(_prev: AddEnquiryState, formData: FormData): Promise<AddEnquiryState> {
  const user = await requireStaff()
  if (!(await csrfOk(formData))) return { status: 'error', message: 'Your session expired. Refresh and try again.' }
  const parsed = enquirySchema.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
    phone: formData.get('phone') ?? '',
    eventType: formData.get('eventType') ?? '',
    message: formData.get('message') ?? '',
  })
  if (!parsed.success) {
    const f = parsed.error.flatten().fieldErrors
    return { status: 'error', errors: { name: f.name?.[0], email: f.email?.[0] } }
  }
  const enquiry = await createEnquiry({ ...parsed.data, source: 'MANUAL' }, user.id)
  revalidatePath('/enquiries')
  return { status: 'created', enquiryId: enquiry.id }
}

/** Outcomes that close or reopen a lead (contract docs/23). Convert/Lost leave the active queue;
 * reopen brings a closed lead back. The case detail also uses these. */
export async function updateEnquiryAction(formData: FormData): Promise<void> {
  const user = await requireStaff()
  if (!(await csrfOk(formData))) throw new Error('Invalid request.')
  const enquiryId = String(formData.get('enquiryId') ?? '')
  const op = String(formData.get('op') ?? '')
  if (!enquiryId) return

  switch (op) {
    case 'lost':
      await markEnquiryLost(enquiryId, 'Not proceeding', user.id)
      break
    case 'reopen':
      await reopenEnquiry(enquiryId, user.id)
      break
    default:
      return
  }
  revalidatePath('/enquiries')
  revalidatePath(`/enquiries/${enquiryId}`)
}

/**
 * Set an enquiry's stage from the list (persists). Open stages advance directly; Booked converts and
 * creates the Job (the caller confirms first); Lost needs a reason; reopen brings a closed lead back.
 * This is the manual override to the workflow-derived stage (docs/24).
 */
export async function setEnquiryStageAction(formData: FormData): Promise<void> {
  const user = await requireStaff()
  if (!(await csrfOk(formData))) throw new Error('Invalid request.')
  const enquiryId = String(formData.get('enquiryId') ?? '')
  const target = String(formData.get('target') ?? '')
  if (!enquiryId) return
  switch (target) {
    case 'NEW':
      await advanceEnquiry(enquiryId, 'NEW', user.id)
      break
    case 'CONTACTED':
      await advanceEnquiry(enquiryId, 'CONTACTED', user.id)
      break
    case 'QUALIFIED':
      await advanceEnquiry(enquiryId, 'QUALIFIED', user.id)
      break
    case 'CONVERTED': {
      const result = await convertEnquiry(enquiryId, user.id)
      if (result.projectId && !result.alreadyConverted) await seedProjectWorkflow(result.projectId)
      break
    }
    case 'LOST': {
      const reason = String(formData.get('reason') ?? '').trim() || 'Not proceeding'
      await markEnquiryLost(enquiryId, reason, user.id)
      break
    }
    case 'REOPEN':
      await reopenEnquiry(enquiryId, user.id)
      break
    default:
      return
  }
  revalidatePath('/enquiries')
  revalidatePath(`/enquiries/${enquiryId}`)
}

/** A yyyy-mm-dd form value to a Date, or null. */
function parseDue(formData: FormData): Date | null {
  const raw = String(formData.get('dueAt') ?? '').trim()
  if (!raw) return null
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d
}

function revalidateEnquiry(enquiryId: string) {
  revalidatePath('/enquiries')
  if (enquiryId) revalidatePath(`/enquiries/${enquiryId}`)
}

/** Toggle a workflow task (tick to complete, tick again to reopen). */
export async function toggleWorkItemAction(formData: FormData): Promise<void> {
  const user = await requireStaff()
  if (!(await csrfOk(formData))) throw new Error('Invalid request.')
  const workItemId = String(formData.get('workItemId') ?? '')
  const enquiryId = String(formData.get('enquiryId') ?? '')
  if (!workItemId) return
  try {
    await toggleEnquiryTask(workItemId, user.id)
  } catch {
    // no-op on stale id
  }
  revalidateEnquiry(enquiryId)
}

/** Add a task to a stage of the enquiry workflow. */
export async function addEnquiryTaskAction(formData: FormData): Promise<void> {
  const user = await requireStaff()
  if (!(await csrfOk(formData))) throw new Error('Invalid request.')
  const enquiryId = String(formData.get('enquiryId') ?? '')
  const stage = String(formData.get('stage') ?? '')
  const title = String(formData.get('title') ?? '')
  const type = String(formData.get('type') ?? 'TODO')
  if (!enquiryId || !stage || !title.trim()) return
  try {
    await addEnquiryTask(enquiryId, stage, title, type, parseDue(formData), user.id)
  } catch {
    // no-op on invalid stage / empty title
  }
  revalidateEnquiry(enquiryId)
}

/** Rename a task and/or change its due date. */
export async function updateEnquiryTaskAction(formData: FormData): Promise<void> {
  const user = await requireStaff()
  if (!(await csrfOk(formData))) throw new Error('Invalid request.')
  const enquiryId = String(formData.get('enquiryId') ?? '')
  const workItemId = String(formData.get('workItemId') ?? '')
  const title = String(formData.get('title') ?? '')
  if (!enquiryId || !workItemId || !title.trim()) return
  try {
    await updateEnquiryTask(workItemId, title, parseDue(formData), user.id)
  } catch {
    // no-op on stale id
  }
  revalidateEnquiry(enquiryId)
}

/** Delete a task from the enquiry workflow. */
export async function deleteEnquiryTaskAction(formData: FormData): Promise<void> {
  const user = await requireStaff()
  if (!(await csrfOk(formData))) throw new Error('Invalid request.')
  const enquiryId = String(formData.get('enquiryId') ?? '')
  const workItemId = String(formData.get('workItemId') ?? '')
  if (!enquiryId || !workItemId) return
  try {
    await deleteEnquiryTask(workItemId, user.id)
  } catch {
    // no-op on stale id
  }
  revalidateEnquiry(enquiryId)
}

/** Move a task up or down within its stage. */
export async function moveEnquiryTaskAction(formData: FormData): Promise<void> {
  const user = await requireStaff()
  if (!(await csrfOk(formData))) throw new Error('Invalid request.')
  const enquiryId = String(formData.get('enquiryId') ?? '')
  const workItemId = String(formData.get('workItemId') ?? '')
  const direction = String(formData.get('direction') ?? '') === 'up' ? 'up' : 'down'
  if (!enquiryId || !workItemId) return
  try {
    await moveEnquiryTask(workItemId, direction, user.id)
  } catch {
    // no-op on stale id
  }
  revalidateEnquiry(enquiryId)
}

/** Staff sends a reply to the client (records an outbound message and moves the ball to the client). */
export async function sendReplyAction(formData: FormData): Promise<void> {
  const user = await requireStaff()
  if (!(await csrfOk(formData))) throw new Error('Invalid request.')
  const enquiryId = String(formData.get('enquiryId') ?? '')
  const body = String(formData.get('body') ?? '')
  if (!enquiryId || !body.trim()) return
  await sendStaffReply(enquiryId, body, user.id)
  revalidatePath('/enquiries')
  revalidatePath(`/enquiries/${enquiryId}`)
}

/** Record a message received from the client (moves the ball back to the studio). */
export async function logClientReplyAction(formData: FormData): Promise<void> {
  const user = await requireStaff()
  if (!(await csrfOk(formData))) throw new Error('Invalid request.')
  const enquiryId = String(formData.get('enquiryId') ?? '')
  const body = String(formData.get('body') ?? '')
  if (!enquiryId || !body.trim()) return
  await logClientReply(enquiryId, body, user.id)
  revalidatePath('/enquiries')
  revalidatePath(`/enquiries/${enquiryId}`)
}

/** Staff moves a settled discussion into the quoting stage. */
export async function startQuotingAction(formData: FormData): Promise<void> {
  const user = await requireStaff()
  if (!(await csrfOk(formData))) throw new Error('Invalid request.')
  const enquiryId = String(formData.get('enquiryId') ?? '')
  if (!enquiryId) return
  await startQuoting(enquiryId, user.id)
  revalidatePath('/enquiries')
  revalidatePath(`/enquiries/${enquiryId}`)
}

/** Convert an enquiry into a client + project, then open the new project. */
export async function convertEnquiryAction(formData: FormData): Promise<void> {
  const user = await requireStaff()
  if (!(await csrfOk(formData))) throw new Error('Invalid request.')
  const enquiryId = String(formData.get('enquiryId') ?? '')
  if (!enquiryId) throw new Error('Missing enquiry.')
  const result = await convertEnquiry(enquiryId, user.id)
  if (result.projectId) await seedProjectWorkflow(result.projectId)
  revalidatePath('/enquiries')
  redirect(`/jobs/${result.projectId}`)
}

/** Mark an enquiry as lost. */
export async function markEnquiryLostAction(formData: FormData): Promise<void> {
  const user = await requireStaff()
  if (!(await csrfOk(formData))) throw new Error('Invalid request.')
  const enquiryId = String(formData.get('enquiryId') ?? '')
  if (!enquiryId) throw new Error('Missing enquiry.')
  const reason = String(formData.get('reason') ?? '').trim() || 'Not proceeding'
  await markEnquiryLost(enquiryId, reason, user.id)
  revalidatePath('/enquiries')
}

