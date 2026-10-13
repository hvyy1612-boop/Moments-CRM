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

export type ClientFormState = { status: 'idle' } | { status: 'error'; message: string; values: ClientFormValues }

function submittedValues(formData: FormData): ClientFormValues {
  const s = (k: string) => String(formData.get(k) ?? '')
  return {
    firstName: s('firstName'), lastName: s('lastName'), company: s('company'), email: s('email'), phone: s('phone'),
    street: s('street'), suburb: s('suburb'), state: s('state'), postcode: s('postcode'), country: s('country'),
    notes: s('notes'), isCompany: formData.get('isCompany') === 'on',
  }
}

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

export async function importClientsAction(_prev: ImportState, formData: FormData): Promise<ImportState> {
  const user = await requireStaff()
  if (!(await csrfOk(formData))) return { status: 'error', message: 'Your session expired. Refresh and try again.' }

  const raw = String(formData.get('csv') ?? '').trim()
  if (!raw) return { status: 'error', message: 'Paste at least one row of CSV first.' }

  const rows = parseCsv(raw)

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

    await deleteEmptyClients([clientId], user.id)
  }
  revalidatePath('/clients')
  redirect(archived ? '/clients?toast=client-archived' : '/clients?toast=client-removed')
}

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

