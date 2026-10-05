'use server'

import { EnquirySource, Prisma } from '@prisma/client'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { CSRF_COOKIE, verifyCsrf } from '@/lib/auth/csrf'
import { getActionUser } from '@/lib/auth/guard'
import { parseCsv } from '@/lib/csv'
import { prisma } from '@/lib/db'
import {
  addClientNote,
  archiveClient,
  clientHasHistory,
  createClient,
  deleteClientNote,
  deleteEmptyClients,
  restoreClient,
  setClientConsent,
  updateClient,
  updateClientNotes,
} from '@/lib/domain/client'
import { createEnquiry } from '@/lib/domain/enquiry'
import { clientSchema } from '@/lib/validation/client'
import type { ClientFormValues } from './ClientForm'

async function requireStaff() {
  const user = await getActionUser()
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

/** What the Add / Edit client form shows when a save is refused: one friendly message plus the values the
 *  staff member typed, so the form re-fills instead of losing their work. */
export type ClientFormState = { status: 'idle' } | { status: 'error'; message: string; values: ClientFormValues }

function submittedValues(formData: FormData): ClientFormValues {
  const s = (k: string) => String(formData.get(k) ?? '')
  return {
    firstName: s('firstName'), lastName: s('lastName'), company: s('company'), email: s('email'), phone: s('phone'),
    street: s('street'), suburb: s('suburb'), state: s('state'), postcode: s('postcode'), country: s('country'),
    notes: s('notes'), isCompany: formData.get('isCompany') === 'on',
  }
}

/** A human message for anything a save threw: our own validation copy passes through; database errors are
 *  translated, never shown raw (friendly-validation rule). */
function friendlyClientError(error: unknown): string {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') return 'A client with this email already exists.'
    if (error.code === 'P2000') return 'One of the fields is too long. Please shorten it and try again.'
    return 'Could not save the client. Please try again.'
  }
  if (error instanceof Prisma.PrismaClientValidationError || error instanceof Prisma.PrismaClientUnknownRequestError) {
    return 'Could not save the client. Please try again.'
  }
  return error instanceof Error && error.message ? error.message : 'Could not save the client. Please try again.'
}

/** The opening lead's own fields, checked BEFORE the client is created so a too-long value can never leave a
 *  client behind with no lead (the columns are event_type 50, coverage 30, partner_name 150). */
function leadExtras(formData: FormData) {
  const str = (k: string) => String(formData.get(k) ?? '').trim() || null
  const limit = (value: string | null, max: number, label: string) => {
    if (value && value.length > max) throw new Error(`Please keep the ${label} under ${max} characters.`)
    return value
  }
  return {
    eventType: limit(str('eventType'), 50, 'event type'),
    partnerName: limit(str('partnerName'), 150, "partner's name"),
    coverage: limit(str('coverage'), 30, 'coverage'),
    gettingReadyLocation: str('gettingReadyLocation'),
    ceremonyLocation: str('ceremonyLocation'),
    weddingDetails: str('weddingDetails'),
    styleReason: str('styleReason'),
    heardAbout: str('heardAbout'),
  }
}

/**
 * The single intake: add a client and open an enquiry (lead) for them in one step, then land on the
 * lead's workflow. A refused save returns a friendly message and the typed values instead of throwing
 * (which replaced the whole page with the error screen).
 */
export async function createClientFormAction(_prev: ClientFormState, formData: FormData): Promise<ClientFormState> {
  const user = await requireStaff()
  if (!(await csrfOk(formData))) return { status: 'error', message: 'Your session expired. Refresh and try again.', values: submittedValues(formData) }
  let enquiryId: string
  try {
    const data = parseClient(formData)
    const extras = leadExtras(formData)
    const client = await createClient(data, user.id)

    const name = [data.firstName, data.lastName].filter(Boolean).join(' ') || data.company || data.email
    const eventDateRaw = String(formData.get('eventDate') ?? '').trim()
    const eventDate = eventDateRaw ? new Date(eventDateRaw) : null
    const sourceRaw = String(formData.get('source') ?? '').toUpperCase()
    const source = (Object.values(EnquirySource) as string[]).includes(sourceRaw)
      ? (sourceRaw as EnquirySource)
      : EnquirySource.MANUAL

    const enquiry = await createEnquiry(
      {
        clientId: client.id,
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
        eventDate,
        message: data.notes ?? null,
        source,
        ...extras,
      },
      user.id,
    )
    enquiryId = enquiry.id
  } catch (error) {
    return { status: 'error', message: friendlyClientError(error), values: submittedValues(formData) }
  }

  revalidatePath('/clients')
  revalidatePath('/leads')
  redirect(`/leads/${enquiryId}?toast=enquiry-added`)
}

export type ImportState =
  | { status: 'idle' }
  | { status: 'error'; message: string }
  | { status: 'done'; created: number; skipped: number; failed: number }

/**
 * Bulk-import client PROFILES from pasted CSV (columns: name, email, phone, [source]). Creates plain
 * client profiles only - it does NOT open enquiries (unlike the single-intake Add client), and skips
 * rows whose email already exists so re-running is safe.
 */
export async function importClientsAction(_prev: ImportState, formData: FormData): Promise<ImportState> {
  const user = await requireStaff()
  if (!(await csrfOk(formData))) return { status: 'error', message: 'Your session expired. Refresh and try again.' }

  const raw = String(formData.get('csv') ?? '').trim()
  if (!raw) return { status: 'error', message: 'Paste at least one row of CSV first.' }

  // Real CSV parsing: quoted fields (a name with a comma, a fully quoted export) and tab-separated rows
  // pasted from a spreadsheet both work, as does a re-import of this app's own export.
  const rows = parseCsv(raw)
  // Drop an optional header row (a cell mentioning "email", and no actual address on the line).
  if (rows[0] && rows[0].some((c) => /email/i.test(c)) && !rows[0].some((c) => c.includes('@'))) rows.shift()

  let created = 0
  let skipped = 0
  let failed = 0
  const seen = new Set<string>()

  for (const cols of rows) {
    const [name = '', email = '', phone = ''] = cols
    const key = email.toLowerCase()
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      failed++
      continue
    }
    if (seen.has(key)) {
      skipped++
      continue
    }
    seen.add(key)
    const existing = await prisma.client.findUnique({ where: { email }, select: { id: true } })
    if (existing) {
      skipped++
      continue
    }
    const parts = name.split(/\s+/).filter(Boolean)
    const parsed = clientSchema.safeParse({
      firstName: parts.slice(0, -1).join(' ') || parts[0] || name || email,
      lastName: parts.length > 1 ? parts[parts.length - 1] : '',
      company: '',
      email,
      phone,
      street: '', suburb: '', state: '', postcode: '', country: '',
      isCompany: false,
      notes: '',
    })
    if (!parsed.success) {
      failed++
      continue
    }
    try {
      await createClient(parsed.data, user.id)
      created++
    } catch {
      failed++
    }
  }

  revalidatePath('/clients')
  return { status: 'done', created, skipped, failed }
}

/** Save edits to a client. */
export async function updateClientFormAction(_prev: ClientFormState, formData: FormData): Promise<ClientFormState> {
  const user = await requireStaff()
  if (!(await csrfOk(formData))) return { status: 'error', message: 'Your session expired. Refresh and try again.', values: submittedValues(formData) }
  const clientId = String(formData.get('clientId') ?? '')
  if (!clientId) return { status: 'error', message: 'Missing client.', values: submittedValues(formData) }
  try {
    await updateClient(clientId, parseClient(formData), user.id)
  } catch (error) {
    return { status: 'error', message: friendlyClientError(error), values: submittedValues(formData) }
  }
  revalidatePath('/clients')
  revalidatePath(`/clients/${clientId}`)
  redirect(`/clients/${clientId}`)
}

/** Archive a client (safe when they have projects). */
export async function archiveClientAction(formData: FormData): Promise<void> {
  const user = await requireStaff()
  if (!(await csrfOk(formData))) throw new Error('Invalid request.')
  // Archiving a client with history is ADMIN only, the same rule removeClientAction enforces (docs/33 §1).
  if (user.role !== 'ADMIN') return
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

/**
 * Remove a single client safely. There is no hard cascade any more: an EMPTY client (no jobs, no
 * enquiries, no merged-in duplicate) is deleted outright; a client WITH history is ARCHIVED instead
 * (reversible via restore), so their jobs, invoices and payment ledger are never destroyed. Archiving a
 * client that has history is ADMIN-only (deleting an empty one is open to any staff); the UI confirms
 * first. Never deletes paid financial records - that closes the old cascade loophole.
 */
export async function removeClientAction(formData: FormData): Promise<void> {
  const user = await requireStaff()
  if (!(await csrfOk(formData))) throw new Error('Invalid request.')
  const clientId = String(formData.get('clientId') ?? '')
  if (!clientId) return
  if (await clientHasHistory(clientId)) {
    if (user.role !== 'ADMIN') {
      throw new Error('Only an admin can archive a client that already has jobs or leads.')
    }
    await archiveClient(clientId, user.id)
  } else {
    // Empty client: safe to delete for good (deleteEmptyClients re-checks emptiness atomically).
    await deleteEmptyClients([clientId], user.id)
  }
  revalidatePath('/clients')
  redirect('/clients')
}

/**
 * Bulk-remove redundant clients from the list's multi-select. Deliberately SAFE: it only ever deletes
 * clients that hold no real work (no jobs, no enquiries, no merged-in duplicate) via `deleteEmptyClients`;
 * any selected client that still has records is silently kept, so this control cannot cascade-delete
 * invoices or job history the way the single admin hard-delete can. Staff-level, CSRF-guarded.
 */
export async function deleteClientsAction(formData: FormData): Promise<void> {
  const user = await requireStaff()
  if (!(await csrfOk(formData))) throw new Error('Invalid request.')
  const ids = String(formData.get('ids') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (ids.length === 0) return
  await deleteEmptyClients(ids, user.id)
  revalidatePath('/clients')
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
