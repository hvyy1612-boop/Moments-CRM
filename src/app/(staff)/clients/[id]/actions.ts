'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { Prisma, ClientSource, ClientStatus } from '@prisma/client'
import { CSRF_COOKIE, verifyCsrf } from '@/lib/auth/csrf'
import { getSessionUser } from '@/lib/auth/guard'
import { prisma } from '@/lib/db'

export type SaveDetailState = { status: 'idle' } | { status: 'error'; message: string } | { status: 'saved' }

const CLIENT_SOURCES = Object.values(ClientSource) as string[]
const CLIENT_STATUSES = Object.values(ClientStatus) as string[]

function text(fd: FormData, key: string): string | null {
  const v = String(fd.get(key) ?? '').trim()
  return v === '' ? null : v
}

export async function saveClientDetailAction(_prev: SaveDetailState, formData: FormData): Promise<SaveDetailState> {
  const user = await getSessionUser()
  if (!user || (user.role !== 'ADMIN' && user.role !== 'STUDIO')) {
    return { status: 'error', message: 'You do not have permission to edit this client.' }
  }
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value ?? ''
  if (!verifyCsrf(cookieValue, formData.get('csrf'))) {
    return { status: 'error', message: 'Your session expired. Refresh and try again.' }
  }

  const clientId = String(formData.get('clientId') ?? '').trim()
  if (!clientId) return { status: 'error', message: 'Something went wrong. Refresh and try again.' }

  const existing = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true, email: true } })
  if (!existing) return { status: 'error', message: 'This client no longer exists.' }

  const displayName = text(formData, 'displayName')
  const email = text(formData, 'email')
  if (!displayName) return { status: 'error', message: 'Please enter a client name.' }
  if (!email) return { status: 'error', message: 'Please enter an email address.' }

  const sourceRaw = String(formData.get('source') ?? '')
  const statusRaw = String(formData.get('status') ?? '')
  const source = CLIENT_SOURCES.includes(sourceRaw) ? (sourceRaw as ClientSource) : undefined
  const status = CLIENT_STATUSES.includes(statusRaw) ? (statusRaw as ClientStatus) : undefined

  const address = text(formData, 'address')

  try {
    await prisma.client.update({
      where: { id: clientId },
      data: {
        displayName,
        partnerName: text(formData, 'partnerName'),
        email,
        phone: text(formData, 'phone'),
        street: address,
        suburb: null,
        state: null,
        postcode: null,
        country: null,
        preferredContact: text(formData, 'preferredContact'),
        ...(source ? { source } : {}),
        ...(status ? { status } : {}),
      },
    })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return { status: 'error', message: 'That email is already used by another client.' }
    }
    throw e
  }

  const enquiryId = String(formData.get('enquiryId') ?? '').trim()
  if (enquiryId) {
    const enq = await prisma.enquiry.findUnique({
      where: { id: enquiryId },
      select: { id: true, clientId: true, convertedClientId: true, email: true },
    })
    const owns = enq != null && (enq.clientId === clientId || enq.convertedClientId === clientId || enq.email === existing.email)
    if (enq && owns) {
      const eventDateRaw = String(formData.get('eventDate') ?? '').trim()
      await prisma.enquiry.update({
        where: { id: enquiryId },
        data: {
          eventDate: eventDateRaw ? new Date(eventDateRaw) : null,
          coverage: text(formData, 'coverage'),
          gettingReadyLocation: text(formData, 'gettingReadyLocation'),
          ceremonyLocation: text(formData, 'ceremonyLocation'),
          weddingDetails: text(formData, 'weddingDetails'),
          styleReason: text(formData, 'styleReason'),
          heardAbout: text(formData, 'heardAbout'),
          message: text(formData, 'additionalNotes'),
          partnerName: text(formData, 'partnerName'),
        },
      })
    }
  }

  revalidatePath(`/clients/${clientId}`)
  return { status: 'saved' }
}
