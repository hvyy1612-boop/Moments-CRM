'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { Prisma, ClientSource, ClientStatus } from '@prisma/client'
import { CSRF_COOKIE, verifyCsrf } from '@/lib/auth/csrf'
import { getActionUser } from '@/lib/auth/guard'
import { prisma } from '@/lib/db'

/**
 * Inline "edit in place" save for the Client detail document. It writes each value back to the record
 * that owns it: identity/contact/address/source/status to the Client, and the event + website-form
 * answers to that client's most recent Enquiry (when one exists). Kept in its own file so it does not
 * collide with the shared clients/enquiries action modules.
 */
export type SaveDetailState =
  | { status: 'idle' }
  // `values` = what was typed, handed back so the form keeps it (React resets a form after every action).
  | { status: 'error'; message: string; values?: Record<string, string> }
  | { status: 'saved' }

const CLIENT_SOURCES = Object.values(ClientSource) as string[]
const CLIENT_STATUSES = Object.values(ClientStatus) as string[]

/** Trimmed string, or null when blank (so a cleared field stores NULL, not ''). */
function text(fd: FormData, key: string): string | null {
  const v = String(fd.get(key) ?? '').trim()
  return v === '' ? null : v
}

/** Column limits (prisma/schema.prisma), checked up front so a long value gets a friendly message, not a crash. */
const LIMITS: [field: string, label: string, max: number][] = [
  ['displayName', 'Client name', 150],
  ['partnerName', 'Partner name', 150],
  ['phone', 'Mobile', 30],
  ['address', 'Address', 200],
  ['preferredContact', 'Preferred contact', 120],
  ['coverage', 'Photography or videography', 30],
]

export async function saveClientDetailAction(_prev: SaveDetailState, formData: FormData): Promise<SaveDetailState> {
  const values: Record<string, string> = {}
  for (const [k, v] of formData.entries()) if (typeof v === 'string' && k !== 'csrf') values[k] = v
  const result = await saveClientDetail(formData)
  return result.status === 'error' ? { ...result, values } : result
}

async function saveClientDetail(formData: FormData): Promise<SaveDetailState> {
  const user = await getActionUser()
  if (!user || (user.role !== 'ADMIN' && user.role !== 'STUDIO')) {
    return { status: 'error', message: 'You do not have permission to edit this client.' }
  }
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value ?? ''
  if (!verifyCsrf(cookieValue, formData.get('csrf'))) {
    return { status: 'error', message: 'Your session expired. Refresh and try again.' }
  }

  const clientId = String(formData.get('clientId') ?? '').trim()
  if (!clientId) return { status: 'error', message: 'Something went wrong. Refresh and try again.' }

  const existing = await prisma.client.findUnique({
    where: { id: clientId },
    select: { id: true, companyId: true, email: true, displayName: true, type: true, status: true, archivedAt: true },
  })
  if (!existing) return { status: 'error', message: 'This client no longer exists.' }

  const displayName = text(formData, 'displayName')
  const email = text(formData, 'email')
  if (!displayName) return { status: 'error', message: 'Please enter a client name.' }
  if (!email) return { status: 'error', message: 'Please enter an email address.' }
  for (const [field, label, max] of LIMITS) {
    if ((text(formData, field) ?? '').length > max) return { status: 'error', message: `${label} is too long. Please keep it under ${max} characters.` }
  }

  const sourceRaw = String(formData.get('source') ?? '')
  const statusRaw = String(formData.get('status') ?? '')
  const source = CLIENT_SOURCES.includes(sourceRaw) ? (sourceRaw as ClientSource) : undefined
  // Archiving is its own ADMIN-only action (it also sets the archived date the list filters on), and an
  // archived client comes back through Restore - so the inline Status can never archive or un-archive.
  const status =
    !existing.archivedAt && CLIENT_STATUSES.includes(statusRaw) && statusRaw !== 'ARCHIVED' ? (statusRaw as ClientStatus) : undefined

  // The document shows one "Address / Suburb" line. Only when staff actually changed it is it stored
  // (in street, clearing the split columns); an untouched address keeps its suburb/state/postcode/country.
  const address = text(formData, 'address')
  const addressChanged = (address ?? '') !== String(formData.get('addressOriginal') ?? '').trim()

  // A renamed person keeps first/last name in step with the display name (the full edit page rebuilds the
  // display name from them); a business keeps its legal name in step instead.
  const renamed = displayName !== existing.displayName
  // Same split as the CSV import: the last word is the last name, everything before it the first name.
  const parts = displayName.split(/\s+/)
  const nameFields = !renamed
    ? {}
    : existing.type === 'BUSINESS'
      ? { legalName: displayName }
      : {
          firstName: (parts.length > 1 ? parts.slice(0, -1).join(' ') : displayName).slice(0, 80),
          lastName: parts.length > 1 ? parts[parts.length - 1]!.slice(0, 80) : null,
        }

  try {
    await prisma.client.update({
      where: { id: clientId },
      data: {
        displayName,
        ...nameFields,
        partnerName: text(formData, 'partnerName'),
        email,
        phone: text(formData, 'phone'),
        ...(addressChanged ? { street: address, suburb: null, state: null, postcode: null, country: null } : {}),
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

  // Event + website-form answers belong to the Enquiry. Only touch one that is actually this client's.
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

  await prisma.auditLog.create({
    data: {
      companyId: existing.companyId, actorUserId: user.id, action: 'client.updated', entityType: 'Client', entityId: clientId,
      source: 'client.inline_edit', afterData: { name: displayName, email },
    },
  })
  revalidatePath(`/clients/${clientId}`)
  return { status: 'saved' }
}
