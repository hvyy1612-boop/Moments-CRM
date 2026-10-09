'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { can } from '@/lib/auth/authz'
import { CSRF_COOKIE, verifyCsrf } from '@/lib/auth/csrf'
import { getActionUser } from '@/lib/auth/guard'
import { prisma } from '@/lib/db'
import { LEAD_DUE_ANCHORS, parseTaskForm } from '@/features/tasks/due'
import { cancelBooking, convertEnquiry, createEnquiry, markEnquiryLost, reopenEnquiry } from '@/lib/domain/enquiry'
import { confirmDirectBooking } from '@/lib/domain/project-workflow'
import { parseNewLead, type NewLeadErrors } from '@/features/enquiries/new-lead'
import {
  addEnquiryNote,
  addEnquiryStage,
  addEnquiryTask,
  deleteEnquiryStage,
  deleteEnquiryTask,
  moveEnquiryTask,
  renameEnquiryStage,
  toggleEnquiryTask,
  updateEnquiryTask,
} from '@/lib/domain/enquiry-workflow'

async function requireStaff() {
  const user = await getActionUser()
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
  // `values` = what was typed, handed back so the modal keeps it (React resets a form after every action).
  | { status: 'error'; message?: string; errors?: AddLeadErrors; values?: Record<string, string> }
  // `projectId` is set when the form added a job (Add job on a client's page).
  | { status: 'created'; enquiryId: string; projectId?: string }

export type AddLeadErrors = NewLeadErrors & { clientId?: string }

/** The Add lead form's own fields, echoed back on a refused save. */
const LEAD_FORM_FIELDS = [
  'leadName', 'jobType', 'jobTypeNote', 'workflow', 'source', 'dateUnconfirmed', 'startDate', 'endDate',
  'allDay', 'startTime', 'endTime', 'location', 'note',
] as const

export type ClientMatch = { id: string; displayName: string; email: string }

/** Type-ahead search for the client picker on the Leads page (name or email). */
export async function searchClientsAction(query: string): Promise<ClientMatch[]> {
  await requireStaff()
  const q = query.trim()
  if (q.length < 2) return []
  return prisma.client.findMany({
    where: {
      // Never offer an archived client: a new lead must hang off a live client.
      archivedAt: null,
      OR: [{ displayName: { contains: q, mode: 'insensitive' } }, { email: { contains: q } }],
    },
    select: { id: true, displayName: true, email: true },
    orderBy: { displayName: 'asc' },
    take: 8,
  })
}

export async function addEnquiryAction(_prev: AddEnquiryState, formData: FormData): Promise<AddEnquiryState> {
  return withTypedValues(await addEnquiry(formData, 'lead'), formData)
}

/**
 * "Add job" on a client's page (Studio Ninja: Add New Job on the client profile): a booking the client has
 * ALREADY confirmed outside the app. Same form and checks as Add lead; the lead is logged and confirmed into
 * a Job at once (same as Add job on the Jobs page) - no payment or contract is invented.
 */
export async function addJobAction(_prev: AddEnquiryState, formData: FormData): Promise<AddEnquiryState> {
  return withTypedValues(await addEnquiry(formData, 'job'), formData)
}

function withTypedValues(result: AddEnquiryState, formData: FormData): AddEnquiryState {
  if (result.status !== 'error') return result
  const values = Object.fromEntries(LEAD_FORM_FIELDS.map((k) => [k, String(formData.get(k) ?? '')]))
  return { ...result, values }
}

/**
 * Staff adds a lead for an EXISTING client (Studio-Ninja style: the client is recorded first, then
 * "Add lead" on their page). Nothing is stored until the form passes; the lead then appears in /leads
 * with its seeded workflow. The contact snapshot (email, phone, address) is copied from the client.
 */
async function addEnquiry(formData: FormData, kind: 'lead' | 'job'): Promise<AddEnquiryState> {
  const user = await requireStaff()
  if (!(await csrfOk(formData))) return { status: 'error', message: 'Your session expired. Refresh and try again.' }

  const clientId = String(formData.get('clientId') ?? '').trim()
  const parsed = parseNewLead(formData, kind)
  const errors: AddLeadErrors = parsed.ok ? {} : { ...parsed.errors }
  if (!clientId) errors.clientId = `Please choose a client for this ${kind}.`
  if (!parsed.ok || Object.keys(errors).length > 0) return { status: 'error', errors }

  const client = await prisma.client.findUnique({ where: { id: clientId } })
  if (!client || client.archivedAt) return { status: 'error', message: 'That client is no longer available. Please choose another client.' }

  const lead = parsed.lead
  const enquiry = await createEnquiry(
    {
      clientId: client.id,
      name: lead.name,
      firstName: client.firstName,
      lastName: client.lastName,
      email: client.email,
      phone: client.phone,
      street: client.street,
      suburb: client.suburb,
      state: client.state,
      postcode: client.postcode,
      country: client.country,
      isCompany: client.type === 'BUSINESS',
      eventType: lead.eventType,
      eventDate: lead.eventDate,
      eventEndDate: lead.eventEndDate,
      eventStartTime: lead.eventStartTime,
      eventEndTime: lead.eventEndTime,
      eventLocation: lead.eventLocation,
      coverage: lead.coverage,
      coverageNote: lead.coverageNote,
      heardAbout: lead.heardAbout,
      message: lead.message,
      source: 'MANUAL',
      // Add job: a confirmed booking, never shown or counted as a lead (LEAD_WHERE).
      createdAsJob: kind === 'job',
    },
    user.id,
  )
  let projectId: string | undefined
  if (kind === 'job') {
    try {
      const converted = await convertEnquiry(enquiry.id, user.id)
      if (!converted.projectId) throw new Error('No job was created.')
      await confirmDirectBooking(converted.projectId, user.id)
      projectId = converted.projectId
    } catch {
      // The lead itself was saved; say so rather than leave staff guessing.
      return { status: 'error', message: 'The lead was saved, but the job could not be created. Open the lead and try again.' }
    }
    revalidatePath('/jobs')
  }
  revalidatePath('/leads')
  revalidatePath('/clients')
  revalidatePath(`/clients/${client.id}`)
  return { status: 'created', enquiryId: enquiry.id, projectId }
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
      await markEnquiryLost(enquiryId, 'Declined', user.id)
      break
    case 'cancel_job':
      await cancelBooking(enquiryId, user.id)
      break
    case 'reopen':
      await reopenEnquiry(enquiryId, user.id)
      break
    default:
      return
  }
  revalidatePath('/leads')
  revalidatePath(`/leads/${enquiryId}`)
  revalidatePath('/jobs')
}

/** Read a lead task form: name + when it is due (none / N days after the lead was created / a set date,
 *  time optional). An appointment always needs a date and a time. Null = invalid (the browser shows the
 *  same checks first, so this only guards the server). */
function readLeadTask(formData: FormData, type: string) {
  const parsed = parseTaskForm(formData, { anchors: LEAD_DUE_ANCHORS, calendarItem: type === 'APPOINTMENT' })
  return parsed.ok ? parsed : null
}

function revalidateEnquiry(enquiryId: string) {
  revalidatePath('/leads')
  if (enquiryId) revalidatePath(`/leads/${enquiryId}`)
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
  const type = String(formData.get('type') ?? 'TODO')
  const task = readLeadTask(formData, type)
  if (!enquiryId || !stage || !task) return
  try {
    await addEnquiryTask(enquiryId, stage, task.title, type, task.due, user.id)
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
  if (!enquiryId || !workItemId) return
  const existing = await prisma.workItem.findUnique({ where: { id: workItemId }, select: { type: true } })
  const task = existing ? readLeadTask(formData, existing.type) : null
  if (!task) return
  try {
    await updateEnquiryTask(workItemId, task.title, task.due, user.id)
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

/** Add a per-lead custom stage (seeded with a starter task so the group persists). */
export async function addEnquiryStageAction(formData: FormData): Promise<void> {
  const user = await requireStaff()
  if (!(await csrfOk(formData))) throw new Error('Invalid request.')
  const enquiryId = String(formData.get('enquiryId') ?? '')
  const name = String(formData.get('stageName') ?? '')
  if (!enquiryId || !name.trim()) return
  try {
    await addEnquiryStage(enquiryId, name, user.id)
  } catch {
    // no-op on empty / duplicate / core-name stage
  }
  revalidateEnquiry(enquiryId)
}

/** Rename a custom stage (re-keys its tasks). Core stages are rejected in the domain. */
export async function renameEnquiryStageAction(formData: FormData): Promise<void> {
  const user = await requireStaff()
  if (!(await csrfOk(formData))) throw new Error('Invalid request.')
  const enquiryId = String(formData.get('enquiryId') ?? '')
  const fromStage = String(formData.get('fromStage') ?? '')
  const toStage = String(formData.get('toStage') ?? '')
  if (!enquiryId || !fromStage || !toStage.trim()) return
  try {
    await renameEnquiryStage(enquiryId, fromStage, toStage, user.id)
  } catch {
    // no-op on core stage / invalid name
  }
  revalidateEnquiry(enquiryId)
}

/** Delete a custom stage and its tasks. Core stages are rejected in the domain. */
export async function deleteEnquiryStageAction(formData: FormData): Promise<void> {
  const user = await requireStaff()
  if (!(await csrfOk(formData))) throw new Error('Invalid request.')
  const enquiryId = String(formData.get('enquiryId') ?? '')
  const stage = String(formData.get('stage') ?? '')
  if (!enquiryId || !stage) return
  try {
    await deleteEnquiryStage(enquiryId, stage, user.id)
  } catch {
    // no-op on core stage
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

/** Add an internal note to a lead (the Notes card on the lead page). */
export async function addEnquiryNoteAction(formData: FormData): Promise<void> {
  const user = await requireStaff()
  if (!(await csrfOk(formData))) throw new Error('Invalid request.')
  const enquiryId = String(formData.get('enquiryId') ?? '')
  const body = String(formData.get('body') ?? '')
  if (!enquiryId || !body.trim()) return
  await addEnquiryNote(enquiryId, body, user.id)
  revalidatePath(`/leads/${enquiryId}`)
}


/**
 * Mark an enquiry as read (Gmail-style): sets viewedAt once, the first time a staff member opens its
 * detail. Idempotent (only updates while still null) and called from a client effect on the detail page
 * so it fires on a real view, not on route prefetch. Clears the "new" bold row + the nav dot.
 */
export async function markEnquiryViewedAction(id: string): Promise<void> {
  const user = await getActionUser()
  if (!user || (user.role !== 'ADMIN' && user.role !== 'STUDIO')) return
  if (!id) return
  await prisma.enquiry.updateMany({ where: { id, viewedAt: null }, data: { viewedAt: new Date() } })
  revalidatePath('/leads')
}
