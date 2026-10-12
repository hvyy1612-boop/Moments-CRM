'use server'

import { Prisma } from '@prisma/client'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { CSRF_COOKIE, verifyCsrf } from '@/lib/auth/csrf'
import { getActionUser } from '@/lib/auth/guard'
import { parseCsv } from '@/lib/csv'
import { prisma } from '@/lib/db'
import { archiveClient, clientHasHistory, createClient, deleteEmptyClients, restoreClient, updateClient } from '@/lib/domain/client'
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

/**
 * Add client: records the client ONLY (Studio-Ninja order - the lead is added afterwards with "Add lead" on
 * the client's page, so nothing shows in Leads until that lead is saved). Lands on the new client's page.
 * A refused save returns a friendly message and the typed values instead of throwing (which replaced the
 * whole page with the error screen).
 */
export async function createClientFormAction(_prev: ClientFormState, formData: FormData): Promise<ClientFormState> {
  const user = await requireStaff()
  if (!(await csrfOk(formData))) return { status: 'error', message: 'Your session expired. Refresh and try again.', values: submittedValues(formData) }
  let clientId: string
  try {
    const client = await createClient(parseClient(formData), user.id)
    clientId = client.id
  } catch (error) {
    return { status: 'error', message: friendlyClientError(error), values: submittedValues(formData) }
  }

  revalidatePath('/clients')
  redirect(`/clients/${clientId}?toast=client-added`)
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
  redirect(`/clients/${clientId}?toast=client-updated`)
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
  redirect(`/clients/${clientId}?toast=client-restored`)
}

/**
 * Remove a single client safely. There is no hard cascade any more: an EMPTY client (no jobs, no
 * leads) is deleted outright; a client WITH history is ARCHIVED instead
 * (reversible via restore), so their jobs, invoices and payment ledger are never destroyed. Any staff
 * member may archive a client with history or delete an empty one (owner decision: Staff = Admin except
 * the Activity log); the UI confirms first. Never deletes paid financial records - that closes the old
 * cascade loophole.
 */
export async function removeClientAction(formData: FormData): Promise<void> {
  const user = await requireStaff()
  if (!(await csrfOk(formData))) throw new Error('Invalid request.')
  const clientId = String(formData.get('clientId') ?? '')
  if (!clientId) return
  let archived = false
  if (await clientHasHistory(clientId)) {
    await archiveClient(clientId, user.id)
    archived = true
  } else {
    // Empty client: safe to delete for good (deleteEmptyClients re-checks emptiness atomically).
    await deleteEmptyClients([clientId], user.id)
  }
  revalidatePath('/clients')
  redirect(archived ? '/clients?toast=client-archived' : '/clients?toast=client-removed')
}

/**
 * Bulk-remove redundant clients from the list's multi-select. Deliberately SAFE: it only ever deletes
 * clients that hold no real work (no jobs, no leads) via `deleteEmptyClients`;
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
  redirect('/clients?toast=clients-removed')
}

