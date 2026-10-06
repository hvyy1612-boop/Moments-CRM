'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { can } from '@/lib/auth/authz'
import { CSRF_COOKIE, verifyCsrf } from '@/lib/auth/csrf'
import { getActionUser } from '@/lib/auth/guard'
import { prisma } from '@/lib/db'
import { sydneyLocalToUtc } from '@/lib/time'
import { findOrCreateClient } from '@/lib/domain/client'
import { cancelBooking, convertEnquiry, createEnquiry, markEnquiryLost, reopenEnquiry } from '@/lib/domain/enquiry'
import { enquirySchema } from '@/lib/validation/enquiry'
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
import { seedProjectWorkflow } from '@/lib/domain/project-workflow'

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
  | { status: 'error'; message?: string; errors?: { name?: string; email?: string }; values?: Record<'name' | 'email' | 'phone' | 'eventType' | 'message', string> }
  | { status: 'created'; enquiryId: string }

/** Staff adds a REAL Enquiry (a lead). It appears immediately in /leads with its seeded workflow. */
export type ClientMatch = { id: string; displayName: string; email: string }

/** Type-ahead search for the "Primary Client Contact" picker (name or email). */
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
  const result = await addEnquiry(formData)
  if (result.status !== 'error') return result
  const get = (k: string) => String(formData.get(k) ?? '')
  return { ...result, values: { name: get('name'), email: get('email'), phone: get('phone'), eventType: get('eventType'), message: get('message') } }
}

async function addEnquiry(formData: FormData): Promise<AddEnquiryState> {
  const user = await requireStaff()
  if (!(await csrfOk(formData))) return { status: 'error', message: 'Your session expired. Refresh and try again.' }
  const eventType = String(formData.get('eventType') ?? '').trim() || null
  const message = String(formData.get('message') ?? '').trim() || null
  // Checked before any client is created: enquiries.event_type is VARCHAR(50) (a longer value used to
  // crash the insert after the new client was already saved).
  if (eventType && eventType.length > 50) return { status: 'error', message: 'Please keep the event type under 50 characters.' }

  // Studio-Ninja "Primary Client Contact": the lead is tied to a client - an existing one that was
  // picked, or a new one created from the typed fields. Either way the person is in Clients.
  const existingClientId = String(formData.get('clientId') ?? '').trim()
  let client
  if (existingClientId) {
    client = await prisma.client.findUnique({ where: { id: existingClientId } })
    if (!client) return { status: 'error', message: 'That client no longer exists.' }
  } else {
    // Coerce to strings first so an absent field never leaks a raw "expected string, received null".
    const name = String(formData.get('name') ?? '').trim()
    const email = String(formData.get('email') ?? '').trim()
    const phone = String(formData.get('phone') ?? '').trim()
    if (!name && !email) {
      return { status: 'error', message: 'Add a client for this lead. Search for an existing one, or fill in the new client details.' }
    }
    const parsed = enquirySchema.safeParse({ name, email, phone })
    if (!parsed.success) {
      const f = parsed.error.flatten().fieldErrors
      if (f.phone?.[0] && !f.name?.[0] && !f.email?.[0]) return { status: 'error', message: `Phone: ${f.phone[0]}` }
      return { status: 'error', errors: { name: f.name?.[0], email: f.email?.[0] } }
    }
    const parts = parsed.data.name.trim().split(/\s+/)
    client = await findOrCreateClient(
      { email: parsed.data.email, firstName: parts[0], lastName: parts.slice(1).join(' ') || undefined, phone: parsed.data.phone },
      user.id,
    )
  }

  const enquiry = await createEnquiry(
    {
      clientId: client.id,
      name: client.displayName,
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
      eventType,
      message,
      source: 'MANUAL',
    },
    user.id,
  )
  revalidatePath('/leads')
  revalidatePath('/clients')
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

/** Combine the form's date (yyyy-mm-dd) and time (HH:mm[:ss]) into a UTC instant, read as Sydney
 *  wall-clock so the calendar can place the task in the right slot. Null when no date was given; a
 *  missing time falls back to 9am. */
function parseDue(formData: FormData): Date | null {
  const date = String(formData.get('dueAt') ?? '').trim()
  if (!date) return null
  const time = String(formData.get('dueTime') ?? '').trim() || '09:00'
  const d = sydneyLocalToUtc(`${date}T${time}`)
  return Number.isNaN(d.getTime()) ? null : d
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

/** Convert an enquiry into a client + project, then open the new project. */
export async function convertEnquiryAction(formData: FormData): Promise<void> {
  const user = await requireStaff()
  if (!(await csrfOk(formData))) throw new Error('Invalid request.')
  const enquiryId = String(formData.get('enquiryId') ?? '')
  if (!enquiryId) throw new Error('Missing enquiry.')
  const result = await convertEnquiry(enquiryId, user.id)
  if (result.projectId) await seedProjectWorkflow(result.projectId)
  revalidatePath('/leads')
  redirect(`/jobs/${result.projectId}?toast=job-created`)
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
