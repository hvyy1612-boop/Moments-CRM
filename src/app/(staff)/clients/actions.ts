'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { CSRF_COOKIE, verifyCsrf } from '@/lib/auth/csrf'
import { getSessionUser } from '@/lib/auth/guard'
import {
  archiveClient,
  createClient,
  deleteClient,
  restoreClient,
  updateClient,
} from '@/lib/domain/client'
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

export async function createClientAction(formData: FormData): Promise<void> {
  const user = await requireStaff()
  if (!(await csrfOk(formData))) throw new Error('Invalid request.')
  const client = await createClient(parseClient(formData), user.id)
  revalidatePath('/clients')
  redirect(`/clients/${client.id}`)
}

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

export async function archiveClientAction(formData: FormData): Promise<void> {
  const user = await requireStaff()
  if (!(await csrfOk(formData))) throw new Error('Invalid request.')
  const clientId = String(formData.get('clientId') ?? '')
  if (!clientId) return
  await archiveClient(clientId, user.id)
  revalidatePath('/clients')
  revalidatePath(`/clients/${clientId}`)
}

export async function restoreClientAction(formData: FormData): Promise<void> {
  const user = await requireStaff()
  if (!(await csrfOk(formData))) throw new Error('Invalid request.')
  const clientId = String(formData.get('clientId') ?? '')
  if (!clientId) return
  await restoreClient(clientId, user.id)
  revalidatePath('/clients')
  revalidatePath(`/clients/${clientId}`)
}

export async function deleteClientAction(formData: FormData): Promise<void> {
  const user = await requireStaff()
  if (!(await csrfOk(formData))) throw new Error('Invalid request.')
  const clientId = String(formData.get('clientId') ?? '')
  if (!clientId) return
  try {
    await deleteClient(clientId, user.id)
  } catch {

    await archiveClient(clientId, user.id)
  }
  revalidatePath('/clients')
}
