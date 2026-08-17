'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { CSRF_COOKIE, verifyCsrf } from '@/lib/auth/csrf'
import { getSessionUser } from '@/lib/auth/guard'
import { prisma } from '@/lib/db'
import { assignResource, createBooking } from '@/lib/domain/booking'
import { createContractFromAcceptedQuote, sendContract } from '@/lib/domain/contract'
import { addGalleryItem, createGallery, publishGallery } from '@/lib/domain/delivery'
import { createInvoice, issueInvoice, recordPayment } from '@/lib/domain/finance'
import { createQuote, saveQuoteDraft, sendQuote } from '@/lib/domain/quote'
import { sendContractEmail, sendQuoteEmail } from '@/lib/email'
import { assignResourceSchema, createBookingSchema } from '@/lib/validation/booking'
import { addGalleryItemSchema, createGallerySchema } from '@/lib/validation/delivery'
import { createInvoiceSchema, recordPaymentSchema } from '@/lib/validation/finance'
import { saveQuoteSchema } from '@/lib/validation/quote'

export type QuoteActionState =
  | { status: 'idle' }
  | { status: 'success' }
  | { status: 'error'; message: string }

async function requireStaff() {
  const user = await getSessionUser()
  if (!user || (user.role !== 'ADMIN' && user.role !== 'STUDIO')) {
    throw new Error('Not authorised.')
  }
  return user
}

function csrfOk(cookieValue: string | undefined, formData: FormData): boolean {
  return verifyCsrf(cookieValue, formData.get('csrf'))
}

/** Create a quote (draft v1) for a project. Plain form action; refreshes the project page. */
export async function createQuoteAction(formData: FormData): Promise<void> {
  const cookieStore = await cookies()
  if (!csrfOk(cookieStore.get(CSRF_COOKIE)?.value, formData)) return
  const user = await requireStaff()
  const projectId = String(formData.get('projectId') ?? '')
  if (!projectId) return
  await createQuote(projectId, user.id)
  revalidatePath(`/projects/${projectId}`)
}

/** Save the draft version's lines + totals. */
export async function saveQuoteAction(
  _prev: QuoteActionState,
  formData: FormData,
): Promise<QuoteActionState> {
  const cookieStore = await cookies()
  if (!csrfOk(cookieStore.get(CSRF_COOKIE)?.value, formData)) {
    return { status: 'error', message: 'Your session expired. Refresh and try again.' }
  }
  await requireStaff()
  const versionId = String(formData.get('versionId') ?? '')
  const projectId = String(formData.get('projectId') ?? '')

  let lines: unknown
  try {
    lines = JSON.parse(String(formData.get('linesJson') ?? '[]'))
  } catch {
    return { status: 'error', message: 'Could not read the quote lines.' }
  }

  const parsed = saveQuoteSchema.safeParse({ lines, validUntil: formData.get('validUntil') ?? '' })
  if (!parsed.success) {
    return { status: 'error', message: parsed.error.issues[0]?.message ?? 'Please check the quote.' }
  }
  const validUntil = parsed.data.validUntil ? new Date(parsed.data.validUntil) : null

  try {
    await saveQuoteDraft(versionId, parsed.data.lines, validUntil)
  } catch (error) {
    return { status: 'error', message: error instanceof Error ? error.message : 'Could not save.' }
  }
  revalidatePath(`/projects/${projectId}`)
  return { status: 'success' }
}

/** Send the current draft to the client and record the email. */
export async function sendQuoteAction(
  _prev: QuoteActionState,
  formData: FormData,
): Promise<QuoteActionState> {
  const cookieStore = await cookies()
  if (!csrfOk(cookieStore.get(CSRF_COOKIE)?.value, formData)) {
    return { status: 'error', message: 'Your session expired. Refresh and try again.' }
  }
  const user = await requireStaff()
  const quoteId = String(formData.get('quoteId') ?? '')
  const projectId = String(formData.get('projectId') ?? '')

  let viewToken: string
  try {
    ;({ viewToken } = await sendQuote(quoteId, user.id))
  } catch (error) {
    return { status: 'error', message: error instanceof Error ? error.message : 'Could not send.' }
  }

  const quote = await prisma.quote.findUnique({
    where: { id: quoteId },
    include: { project: { include: { client: { select: { email: true, displayName: true } } } } },
  })
  if (quote) {
    const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
    await sendQuoteEmail({
      to: quote.project.client.email,
      clientName: quote.project.client.displayName,
      quoteLink: `${base}/quote/${viewToken}`,
    })
  }
  revalidatePath(`/projects/${projectId}`)
  return { status: 'success' }
}

/** Generate a draft contract from the project's accepted quote. Plain form action. */
export async function createContractAction(formData: FormData): Promise<void> {
  const cookieStore = await cookies()
  if (!csrfOk(cookieStore.get(CSRF_COOKIE)?.value, formData)) return
  const user = await requireStaff()
  const projectId = String(formData.get('projectId') ?? '')
  if (!projectId) return
  try {
    await createContractFromAcceptedQuote(projectId, user.id)
  } catch {
    // The button only shows in a valid state; a double submit ("already exists") is a no-op here.
  }
  revalidatePath(`/projects/${projectId}`)
}

/** Send the draft contract to the client and record the email. */
export async function sendContractAction(
  _prev: QuoteActionState,
  formData: FormData,
): Promise<QuoteActionState> {
  const cookieStore = await cookies()
  if (!csrfOk(cookieStore.get(CSRF_COOKIE)?.value, formData)) {
    return { status: 'error', message: 'Your session expired. Refresh and try again.' }
  }
  const user = await requireStaff()
  const contractId = String(formData.get('contractId') ?? '')
  const projectId = String(formData.get('projectId') ?? '')

  let signToken: string
  try {
    ;({ signToken } = await sendContract(contractId, user.id))
  } catch (error) {
    return { status: 'error', message: error instanceof Error ? error.message : 'Could not send.' }
  }

  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    include: { project: { include: { client: { select: { email: true, displayName: true } } } } },
  })
  if (contract) {
    const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
    await sendContractEmail({
      to: contract.project.client.email,
      clientName: contract.project.client.displayName,
      contractLink: `${base}/contract/${signToken}`,
    })
  }
  revalidatePath(`/projects/${projectId}`)
  return { status: 'success' }
}

/** Schedule a shoot for a confirmed project. */
export async function createBookingAction(
  _prev: QuoteActionState,
  formData: FormData,
): Promise<QuoteActionState> {
  const cookieStore = await cookies()
  if (!csrfOk(cookieStore.get(CSRF_COOKIE)?.value, formData)) {
    return { status: 'error', message: 'Your session expired. Refresh and try again.' }
  }
  const user = await requireStaff()
  const projectId = String(formData.get('projectId') ?? '')

  const parsed = createBookingSchema.safeParse({
    title: formData.get('title') ?? '',
    startsAt: formData.get('startsAt') ?? '',
    endsAt: formData.get('endsAt') ?? '',
    location: formData.get('location') ?? '',
    notes: formData.get('notes') ?? '',
  })
  if (!parsed.success) {
    return { status: 'error', message: parsed.error.issues[0]?.message ?? 'Please check the booking.' }
  }
  try {
    await createBooking(projectId, parsed.data, user.id)
  } catch (error) {
    return { status: 'error', message: error instanceof Error ? error.message : 'Could not schedule.' }
  }
  revalidatePath(`/projects/${projectId}`)
  return { status: 'success' }
}

/** Assign a resource to a booking; blocked if that resource clashes with an overlapping booking. */
export async function assignResourceAction(
  _prev: QuoteActionState,
  formData: FormData,
): Promise<QuoteActionState> {
  const cookieStore = await cookies()
  if (!csrfOk(cookieStore.get(CSRF_COOKIE)?.value, formData)) {
    return { status: 'error', message: 'Your session expired. Refresh and try again.' }
  }
  const user = await requireStaff()
  const projectId = String(formData.get('projectId') ?? '')
  const bookingId = String(formData.get('bookingId') ?? '')

  const parsed = assignResourceSchema.safeParse({
    resourceId: formData.get('resourceId') ?? '',
    role: formData.get('role') ?? '',
  })
  if (!parsed.success) {
    return { status: 'error', message: parsed.error.issues[0]?.message ?? 'Please pick a resource.' }
  }
  try {
    await assignResource(bookingId, parsed.data, user.id)
  } catch (error) {
    return { status: 'error', message: error instanceof Error ? error.message : 'Could not assign.' }
  }
  revalidatePath(`/projects/${projectId}`)
  return { status: 'success' }
}

/** Raise a draft invoice for a confirmed project. */
export async function createInvoiceAction(
  _prev: QuoteActionState,
  formData: FormData,
): Promise<QuoteActionState> {
  const cookieStore = await cookies()
  if (!csrfOk(cookieStore.get(CSRF_COOKIE)?.value, formData)) {
    return { status: 'error', message: 'Your session expired. Refresh and try again.' }
  }
  const user = await requireStaff()
  const projectId = String(formData.get('projectId') ?? '')

  const parsed = createInvoiceSchema.safeParse({
    type: formData.get('type') ?? '',
    description: formData.get('description') ?? '',
    amount: formData.get('amount') ?? '',
  })
  if (!parsed.success) {
    return { status: 'error', message: parsed.error.issues[0]?.message ?? 'Please check the invoice.' }
  }
  try {
    await createInvoice(projectId, parsed.data, user.id)
  } catch (error) {
    return { status: 'error', message: error instanceof Error ? error.message : 'Could not raise the invoice.' }
  }
  revalidatePath(`/projects/${projectId}`)
  return { status: 'success' }
}

/** Issue a draft invoice. Plain form action; the button only shows on a draft. */
export async function issueInvoiceAction(formData: FormData): Promise<void> {
  const cookieStore = await cookies()
  if (!csrfOk(cookieStore.get(CSRF_COOKIE)?.value, formData)) return
  const user = await requireStaff()
  const projectId = String(formData.get('projectId') ?? '')
  const invoiceId = String(formData.get('invoiceId') ?? '')
  if (!invoiceId) return
  try {
    await issueInvoice(invoiceId, user.id)
  } catch {
    // A double submit ("already issued") is a no-op here; the re-render shows the real state.
  }
  revalidatePath(`/projects/${projectId}`)
}

/** Record a manual payment against an invoice. */
export async function recordPaymentAction(
  _prev: QuoteActionState,
  formData: FormData,
): Promise<QuoteActionState> {
  const cookieStore = await cookies()
  if (!csrfOk(cookieStore.get(CSRF_COOKIE)?.value, formData)) {
    return { status: 'error', message: 'Your session expired. Refresh and try again.' }
  }
  const user = await requireStaff()
  const projectId = String(formData.get('projectId') ?? '')
  const invoiceId = String(formData.get('invoiceId') ?? '')

  const parsed = recordPaymentSchema.safeParse({
    paymentMethod: formData.get('paymentMethod') ?? '',
    amount: formData.get('amount') ?? '',
    reference: formData.get('reference') ?? '',
  })
  if (!parsed.success) {
    return { status: 'error', message: parsed.error.issues[0]?.message ?? 'Please check the payment.' }
  }
  try {
    await recordPayment(invoiceId, parsed.data, user.id)
  } catch (error) {
    return { status: 'error', message: error instanceof Error ? error.message : 'Could not record the payment.' }
  }
  revalidatePath(`/projects/${projectId}`)
  return { status: 'success' }
}

/** Start a draft gallery for a confirmed project. */
export async function createGalleryAction(
  _prev: QuoteActionState,
  formData: FormData,
): Promise<QuoteActionState> {
  const cookieStore = await cookies()
  if (!csrfOk(cookieStore.get(CSRF_COOKIE)?.value, formData)) {
    return { status: 'error', message: 'Your session expired. Refresh and try again.' }
  }
  const user = await requireStaff()
  const projectId = String(formData.get('projectId') ?? '')

  const parsed = createGallerySchema.safeParse({ title: formData.get('title') ?? '' })
  if (!parsed.success) {
    return { status: 'error', message: parsed.error.issues[0]?.message ?? 'Please check the gallery.' }
  }
  try {
    await createGallery(projectId, parsed.data, user.id)
  } catch (error) {
    return { status: 'error', message: error instanceof Error ? error.message : 'Could not create the gallery.' }
  }
  revalidatePath(`/projects/${projectId}`)
  return { status: 'success' }
}

/** Add an item (caption + link) to a draft gallery. */
export async function addGalleryItemAction(
  _prev: QuoteActionState,
  formData: FormData,
): Promise<QuoteActionState> {
  const cookieStore = await cookies()
  if (!csrfOk(cookieStore.get(CSRF_COOKIE)?.value, formData)) {
    return { status: 'error', message: 'Your session expired. Refresh and try again.' }
  }
  const user = await requireStaff()
  const projectId = String(formData.get('projectId') ?? '')
  const galleryId = String(formData.get('galleryId') ?? '')

  const parsed = addGalleryItemSchema.safeParse({
    caption: formData.get('caption') ?? '',
    url: formData.get('url') ?? '',
  })
  if (!parsed.success) {
    return { status: 'error', message: parsed.error.issues[0]?.message ?? 'Please check the item.' }
  }
  try {
    await addGalleryItem(galleryId, parsed.data, user.id)
  } catch (error) {
    return { status: 'error', message: error instanceof Error ? error.message : 'Could not add the item.' }
  }
  revalidatePath(`/projects/${projectId}`)
  return { status: 'success' }
}

/** Publish a gallery to the client and complete the project. Plain form action. */
export async function publishGalleryAction(formData: FormData): Promise<void> {
  const cookieStore = await cookies()
  if (!csrfOk(cookieStore.get(CSRF_COOKIE)?.value, formData)) return
  const user = await requireStaff()
  const projectId = String(formData.get('projectId') ?? '')
  const galleryId = String(formData.get('galleryId') ?? '')
  if (!galleryId) return
  try {
    await publishGallery(galleryId, user.id)
  } catch {
    // The button only shows on a draft with items; a double submit is a no-op here.
  }
  revalidatePath(`/projects/${projectId}`)
}
