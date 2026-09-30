'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { can } from '@/lib/auth/authz'
import { CSRF_COOKIE, verifyCsrf } from '@/lib/auth/csrf'
import { getSessionUser } from '@/lib/auth/guard'
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
  logClientReply,
  moveEnquiryTask,
  renameEnquiryStage,
  sendStaffReply,
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

export type ClientMatch = { id: string; displayName: string; email: string }

export async function searchClientsAction(query: string): Promise<ClientMatch[]> {
  await requireStaff()
  const q = query.trim()
  if (q.length < 2) return []
  return prisma.client.findMany({
    where: {
      OR: [{ displayName: { contains: q, mode: 'insensitive' } }, { email: { contains: q } }],
    },
    select: { id: true, displayName: true, email: true },
    orderBy: { displayName: 'asc' },
    take: 8,
  })
}

export async function addEnquiryAction(_prev: AddEnquiryState, formData: FormData): Promise<AddEnquiryState> {
  const user = await requireStaff()
  if (!(await csrfOk(formData))) return { status: 'error', message: 'Your session expired. Refresh and try again.' }
  const eventType = String(formData.get('eventType') ?? '').trim() || null
  const message = String(formData.get('message') ?? '').trim() || null

  const existingClientId = String(formData.get('clientId') ?? '').trim()
  let client
  if (existingClientId) {
    client = await prisma.client.findUnique({ where: { id: existingClientId } })
    if (!client) return { status: 'error', message: 'That client no longer exists.' }
  } else {

    const name = String(formData.get('name') ?? '').trim()
    const email = String(formData.get('email') ?? '').trim()
    const phone = String(formData.get('phone') ?? '').trim()
    if (!name && !email) {
      return { status: 'error', message: 'Add a client for this lead. Search for an existing one, or fill in the new client details.' }
    }
    const parsed = enquirySchema.safeParse({ name, email, phone })
    if (!parsed.success) {
      const f = parsed.error.flatten().fieldErrors
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

export async function sendReplyAction(formData: FormData): Promise<void> {
  const user = await requireStaff()
  if (!(await csrfOk(formData))) throw new Error('Invalid request.')
  const enquiryId = String(formData.get('enquiryId') ?? '')
  const body = String(formData.get('body') ?? '')
  if (!enquiryId || !body.trim()) return
  await sendStaffReply(enquiryId, body, user.id)
  revalidatePath('/leads')
  revalidatePath(`/leads/${enquiryId}`)
}

export async function logClientReplyAction(formData: FormData): Promise<void> {
  const user = await requireStaff()
  if (!(await csrfOk(formData))) throw new Error('Invalid request.')
  const enquiryId = String(formData.get('enquiryId') ?? '')
  const body = String(formData.get('body') ?? '')
  if (!enquiryId || !body.trim()) return
  await logClientReply(enquiryId, body, user.id)
  revalidatePath('/leads')
  revalidatePath(`/leads/${enquiryId}`)
}

export async function addEnquiryNoteAction(formData: FormData): Promise<void> {
  const user = await requireStaff()
  if (!(await csrfOk(formData))) throw new Error('Invalid request.')
  const enquiryId = String(formData.get('enquiryId') ?? '')
  const body = String(formData.get('body') ?? '')
  if (!enquiryId || !body.trim()) return
  await addEnquiryNote(enquiryId, body, user.id)
  revalidatePath(`/leads/${enquiryId}`)
}

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

export async function markEnquiryLostAction(formData: FormData): Promise<void> {
  const user = await requireStaff()
  if (!(await csrfOk(formData))) throw new Error('Invalid request.')
  const enquiryId = String(formData.get('enquiryId') ?? '')
  if (!enquiryId) throw new Error('Missing enquiry.')
  const reason = String(formData.get('reason') ?? '').trim() || 'Cancelled'
  await markEnquiryLost(enquiryId, reason, user.id)
  revalidatePath('/leads')
}

export async function markEnquiryViewedAction(id: string): Promise<void> {
  const user = await getSessionUser()
  if (!user || (user.role !== 'ADMIN' && user.role !== 'STUDIO')) return
  if (!id) return
  await prisma.enquiry.updateMany({ where: { id, viewedAt: null }, data: { viewedAt: new Date() } })
  revalidatePath('/leads')
}
