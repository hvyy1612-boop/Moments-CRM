'use server'

import { EnquirySource } from '@prisma/client'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { CSRF_COOKIE, verifyCsrf } from '@/lib/auth/csrf'
import { getSessionUser } from '@/lib/auth/guard'
import {
  addClientNote,
  archiveClient,
  createClient,
  deleteClient,
  deleteClientNote,
  restoreClient,
  setClientConsent,
  updateClient,
  updateClientNotes,
} from '@/lib/domain/client'
import { createEnquiry } from '@/lib/domain/enquiry'
import { clientSchema } from '@/lib/validation/client'

async function requireStaff() {
  const user = await getSessionUser()
  if (!user || (user.role !== 'ADMIN' && user.role !== 'STUDIO')) {
    throw new Error('Not authorised.')
  }
  return user
}

async function csrfOk(formData: FormData): Promise<boolean> {
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value
  return verifyCsrf(cookieValue, formData.get('csrf'))
}

function parseClient(formData: FormData) {
  const parsed = clientSchema.safeParse({
    firstName: formData.get('firstName'),
    lastName: formData.get('lastName'),
    company: formData.get('company'),
    email: formData.get('email'),
    phone: formData.get('phone'),
    street: formData.get('street'),
    suburb: formData.get('suburb'),
    state: formData.get('state'),
    postcode: formData.get('postcode'),
    country: formData.get('country'),
    isCompany: formData.get('isCompany') === 'on',
    notes: formData.get('notes'),
  })
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Please check the form.')
  return parsed.data
}

/**
 * The single intake: add a client and open an enquiry (lead) for them in one step, then land on the
 * enquiry's workflow. This is the only place a lead is created by staff - there is no separate "log
 * enquiry" form. Converting the enquiry later reuses this client (dedup by email).
 */
export async function createClientAction(formData: FormData): Promise<void> {
  const user = await requireStaff()
  if (!(await csrfOk(formData))) throw new Error('Invalid request.')
  const data = parseClient(formData)
  await createClient(data, user.id)

  const name = [data.firstName, data.lastName].filter(Boolean).join(' ') || data.company || data.email
  const eventDateRaw = String(formData.get('eventDate') ?? '').trim()
  const eventDate = eventDateRaw ? new Date(eventDateRaw) : null
  const sourceRaw = String(formData.get('source') ?? '').toUpperCase()
  const source = (Object.values(EnquirySource) as string[]).includes(sourceRaw)
    ? (sourceRaw as EnquirySource)
    : EnquirySource.MANUAL

  const enquiry = await createEnquiry(
    {
      name,
      firstName: data.firstName ?? null,
      lastName: data.lastName ?? null,
      email: data.email,
      phone: data.phone ?? null,
      street: data.street ?? null,
      suburb: data.suburb ?? null,
      state: data.state ?? null,
      postcode: data.postcode ?? null,
      country: data.country ?? null,
      isCompany: data.isCompany ?? false,
      eventType: String(formData.get('eventType') ?? '').trim() || null,
      eventDate,
      message: data.notes ?? null,
      source,
    },
    user.id,
  )

  revalidatePath('/clients')
  revalidatePath('/enquiries')
  redirect(`/enquiries/${enquiry.id}`)
}

/** Save edits to a client. */
export async function updateClientAction(formData: FormData): Promise<void> {
  const user = await requireStaff()
  if (!(await csrfOk(formData))) throw new Error('Invalid request.')
  const clientId = String(formData.get('clientId') ?? '')
  if (!clientId) throw new Error('Missing client.')
  await updateClient(clientId, parseClient(formData), user.id)
  revalidatePath('/clients')
  revalidatePath(`/clients/${clientId}`)
  redirect(`/clients/${clientId}`)
}

/** Archive a client (safe when they have projects). */
export async function archiveClientAction(formData: FormData): Promise<void> {
  const user = await requireStaff()
  if (!(await csrfOk(formData))) throw new Error('Invalid request.')
  const clientId = String(formData.get('clientId') ?? '')
  if (!clientId) return
  await archiveClient(clientId, user.id)
  revalidatePath('/clients')
  revalidatePath(`/clients/${clientId}`)
}

/** Restore an archived client to the active list. */
export async function restoreClientAction(formData: FormData): Promise<void> {
  const user = await requireStaff()
  if (!(await csrfOk(formData))) throw new Error('Invalid request.')
  const clientId = String(formData.get('clientId') ?? '')
  if (!clientId) return
  await restoreClient(clientId, user.id)
  revalidatePath('/clients')
  revalidatePath(`/clients/${clientId}`)
}

/** Permanently delete a client and all their jobs/history (ADMIN only; the UI confirms first). */
export async function deleteClientAction(formData: FormData): Promise<void> {
  const user = await requireStaff()
  if (user.role !== 'ADMIN') throw new Error('Only an admin can permanently delete a client.')
  if (!(await csrfOk(formData))) throw new Error('Invalid request.')
  const clientId = String(formData.get('clientId') ?? '')
  if (!clientId) return
  await deleteClient(clientId, user.id)
  revalidatePath('/clients')
  redirect('/clients')
}

/** Add a titled note to a client's notes list. */
export async function addClientNoteAction(formData: FormData): Promise<void> {
  const user = await requireStaff()
  if (!(await csrfOk(formData))) throw new Error('Invalid request.')
  const clientId = String(formData.get('clientId') ?? '')
  if (!clientId) return
  await addClientNote(clientId, String(formData.get('title') ?? ''), String(formData.get('body') ?? ''), user.id)
  revalidatePath(`/clients/${clientId}`)
}

/** Delete one client note. */
export async function deleteClientNoteAction(formData: FormData): Promise<void> {
  await requireStaff()
  if (!(await csrfOk(formData))) throw new Error('Invalid request.')
  const noteId = String(formData.get('noteId') ?? '')
  const clientId = String(formData.get('clientId') ?? '')
  if (!noteId) return
  await deleteClientNote(noteId)
  if (clientId) revalidatePath(`/clients/${clientId}`)
}

/** Record or withdraw a client's marketing consent. */
export async function setClientConsentAction(formData: FormData): Promise<void> {
  await requireStaff()
  if (!(await csrfOk(formData))) throw new Error('Invalid request.')
  const clientId = String(formData.get('clientId') ?? '')
  if (!clientId) return
  await setClientConsent(clientId, formData.get('consent') === 'true')
  revalidatePath(`/clients/${clientId}`)
}

/** Save the free-text note on a client (inline on the client page). */
export async function updateClientNotesAction(formData: FormData): Promise<void> {
  const user = await requireStaff()
  if (!(await csrfOk(formData))) throw new Error('Invalid request.')
  const clientId = String(formData.get('clientId') ?? '')
  if (!clientId) return
  await updateClientNotes(clientId, String(formData.get('notes') ?? ''), user.id)
  revalidatePath(`/clients/${clientId}`)
}
