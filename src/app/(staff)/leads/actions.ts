'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { can } from '@/lib/auth/authz'
import { CSRF_COOKIE, verifyCsrf } from '@/lib/auth/csrf'
import { getActionUser } from '@/lib/auth/guard'
import { prisma } from '@/lib/db'
import { LEAD_DUE_ANCHORS, parseTaskForm } from '@/features/tasks/due'
import { cancelBooking, createEnquiry, setLeadJobComplete, markEnquiryLost, reopenEnquiry } from '@/lib/domain/enquiry'
import { acceptLeadAsJob, createDirectJob } from '@/lib/domain/project-workflow'
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
  // Add lead returns the new lead; Add job returns the new job (it has no lead).
  | { status: 'created'; enquiryId?: string; projectId?: string }

export type AddLeadErrors = NewLeadErrors & { clientId?: string }

const LEAD_FORM_FIELDS = [
  'leadName', 'jobType', 'jobTypeNote', 'workflow', 'source', 'dateUnconfirmed', 'startDate', 'endDate',
  'allDay', 'startTime', 'endTime', 'location', 'note',
] as const

export type ClientMatch = { id: string; displayName: string; email: string }

export async function searchClientsAction(query: string): Promise<ClientMatch[]> {
  await requireStaff()
  const q = query.trim()
  if (q.length < 2) return []
  return prisma.client.findMany({
    where: {

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

export async function addJobAction(_prev: AddEnquiryState, formData: FormData): Promise<AddEnquiryState> {
  return withTypedValues(await addEnquiry(formData, 'job'), formData)
}

function withTypedValues(result: AddEnquiryState, formData: FormData): AddEnquiryState {
  if (result.status !== 'error') return result
  const values = Object.fromEntries(LEAD_FORM_FIELDS.map((k) => [k, String(formData.get(k) ?? '')]))
  return { ...result, values }
}

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
  if (kind === 'job') {
    let projectId: string
    try {
      const job = await createDirectJob(
        {
          clientId: client.id,
          name: lead.name,
          eventType: lead.eventType,
          coverage: lead.coverage,
          coverageNote: lead.coverageNote,
          heardAbout: lead.heardAbout,
          shootDate: lead.eventDate,
          shootEndDate: lead.eventEndDate,
          shootStartTime: lead.eventStartTime,
          shootEndTime: lead.eventEndTime,
          shootLocation: lead.eventLocation,
          note: lead.message,
        },
        user.id,
      )
      projectId = job.id
    } catch {
      return { status: 'error', message: 'The job could not be created. Please try again.' }
    }
    revalidatePath('/jobs')
    revalidatePath('/clients')
    revalidatePath(`/clients/${client.id}`)
    return { status: 'created', projectId }
  }

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
    },
    user.id,
  )
  revalidatePath('/leads')
  revalidatePath('/clients')
  revalidatePath(`/clients/${client.id}`)
  return { status: 'created', enquiryId: enquiry.id }
}

export async function acceptLeadAsJobAction(formData: FormData): Promise<void> {
  const user = await requireStaff()
  if (!(await csrfOk(formData))) throw new Error('Invalid request.')
  const enquiryId = String(formData.get('enquiryId') ?? '')
  if (!enquiryId) return
  let projectId: string
  try {
    projectId = (await acceptLeadAsJob(enquiryId, user.id)).projectId
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The job could not be created.'
    redirect(`/leads/${enquiryId}?acceptError=${encodeURIComponent(message)}`)
  }
  revalidatePath('/leads')
  revalidatePath('/jobs')
  revalidatePath(`/leads/${enquiryId}`)
  redirect(`/jobs/${projectId}?toast=job-added`)
}

export async function toggleLeadJobCompleteAction(formData: FormData): Promise<void> {
  const user = await requireStaff()
  if (!(await csrfOk(formData))) throw new Error('Invalid request.')
  const enquiryId = String(formData.get('enquiryId') ?? '')
  if (!enquiryId) return
  await setLeadJobComplete(enquiryId, formData.get('done') === 'true', user.id)
  revalidatePath(`/leads/${enquiryId}`)
}

export async function updateEnquiryAction(formData: FormData): Promise<void> {
  const user = await requireStaff()
  if (!(await csrfOk(formData))) throw new Error('Invalid request.')
  const enquiryId = String(formData.get('enquiryId') ?? '')
  const op = String(formData.get('op') ?? '')
  if (!enquiryId) return

  let toastCode: string
  switch (op) {
    case 'lost':
      await markEnquiryLost(enquiryId, 'Archived', user.id)
      toastCode = 'lead-archived'
      break
    case 'cancel_job':
      await cancelBooking(enquiryId, user.id)
      toastCode = 'booking-cancelled'
      break
    case 'reopen':
      await reopenEnquiry(enquiryId, user.id)
      toastCode = 'lead-reopened'
      break
    default:
      return
  }
  revalidatePath('/leads')
  revalidatePath(`/leads/${enquiryId}`)
  revalidatePath('/jobs')
  redirect(`/leads/${enquiryId}?toast=${toastCode}`)
}

function readLeadTask(formData: FormData, type: string) {
  const parsed = parseTaskForm(formData, { anchors: LEAD_DUE_ANCHORS, calendarItem: type === 'APPOINTMENT' })
  return parsed.ok ? parsed : null
}

function revalidateEnquiry(enquiryId: string) {
  revalidatePath('/leads')
  if (enquiryId) revalidatePath(`/leads/${enquiryId}`)
}

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

export async function addEnquiryNoteAction(formData: FormData): Promise<void> {
  const user = await requireStaff()
  if (!(await csrfOk(formData))) throw new Error('Invalid request.')
  const enquiryId = String(formData.get('enquiryId') ?? '')
  const body = String(formData.get('body') ?? '')
  if (!enquiryId || !body.trim()) return
  await addEnquiryNote(enquiryId, body, user.id)
  revalidatePath(`/leads/${enquiryId}`)
  redirect(`/leads/${enquiryId}?toast=note-added`)
}

export async function markEnquiryViewedAction(id: string): Promise<void> {
  const user = await getActionUser()
  if (!user || (user.role !== 'ADMIN' && user.role !== 'STUDIO')) return
  if (!id) return
  await prisma.enquiry.updateMany({ where: { id, viewedAt: null }, data: { viewedAt: new Date() } })
  revalidatePath('/leads')
}
