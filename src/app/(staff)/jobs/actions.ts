'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { CSRF_COOKIE, verifyCsrf } from '@/lib/auth/csrf'
import { getSessionUser } from '@/lib/auth/guard'
import { prisma } from '@/lib/db'
import { assignResource, createBooking } from '@/lib/domain/booking'
import { logCommunication } from '@/lib/domain/communication'
import { createProjectFromEnquiry } from '@/lib/domain/project'
import {
  addProjectStageBlock,
  addProjectTask,
  deleteProjectTask,
  moveProjectTask,
  toggleProjectTask,
  updateProjectTask,
} from '@/lib/domain/project-workflow'
import { enquirySchema } from '@/lib/validation/enquiry'
import { createContractFromAcceptedQuote, sendContract } from '@/lib/domain/contract'
import { addGalleryItem, createGallery, publishGallery } from '@/lib/domain/delivery'
import { createInvoice, createInvoiceWithLines, deleteInvoice, issueInvoice, recordPayment, saveInvoiceTemplate, updateInvoiceWithLines, voidInvoice } from '@/lib/domain/finance'
import { refundPayment } from '@/lib/domain/refund'
import { createQuote, saveQuoteDraft, sendQuote } from '@/lib/domain/quote'
import { createQuestionnaire } from '@/lib/domain/questionnaire'
import { sendContractEmail, sendQuoteEmail } from '@/lib/email'
import { assignResourceSchema, createBookingSchema } from '@/lib/validation/booking'
import { addGalleryItemSchema, createGallerySchema } from '@/lib/validation/delivery'
import { createInvoiceLinesSchema, createInvoiceSchema, recordPaymentSchema } from '@/lib/validation/finance'
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
  revalidatePath(`/jobs/${projectId}`)
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
  revalidatePath(`/jobs/${projectId}`)
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
  revalidatePath(`/jobs/${projectId}`)
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
  revalidatePath(`/jobs/${projectId}`)
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
  revalidatePath(`/jobs/${projectId}`)
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
  revalidatePath(`/jobs/${projectId}`)
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
  revalidatePath(`/jobs/${projectId}`)
  return { status: 'success' }
}

/** Raise a draft invoice for a confirmed project. */
export async function createInvoiceLinesAction(
  _prev: QuoteActionState,
  formData: FormData,
): Promise<QuoteActionState> {
  const cookieStore = await cookies()
  if (!csrfOk(cookieStore.get(CSRF_COOKIE)?.value, formData)) {
    return { status: 'error', message: 'Your session expired. Refresh and try again.' }
  }
  const user = await requireStaff()
  const projectId = String(formData.get('projectId') ?? '')

  let lines: unknown = []
  let instalments: unknown = []
  try {
    lines = JSON.parse(String(formData.get('lines') ?? '[]'))
    instalments = JSON.parse(String(formData.get('instalments') ?? '[]'))
  } catch {
    return { status: 'error', message: 'Could not read the invoice items.' }
  }
  const parsed = createInvoiceLinesSchema.safeParse({
    type: formData.get('type') ?? '',
    invoiceNumber: formData.get('invoiceNumber') ?? '',
    invoiceDate: formData.get('invoiceDate') ?? '',
    poNumber: formData.get('poNumber') ?? '',
    notes: formData.get('notes') ?? '',
    discount: formData.get('discount') ?? '',
    lines,
    instalments,
  })
  if (!parsed.success) {
    return { status: 'error', message: parsed.error.issues[0]?.message ?? 'Please check the invoice.' }
  }
  let created
  try {
    created = await createInvoiceWithLines(projectId, parsed.data, user.id)
  } catch (error) {
    return { status: 'error', message: error instanceof Error ? error.message : 'Could not raise the invoice.' }
  }
  revalidatePath(`/jobs/${projectId}`)
  revalidatePath('/finance')
  // Land on the invoice's own page - inline preview + Download PDF, no jumping around.
  redirect(`/finance/${created.id}`)
}

/** Save edits to an existing (unpaid) invoice. Same shape as create, plus invoiceId. */
export async function updateInvoiceLinesAction(
  _prev: QuoteActionState,
  formData: FormData,
): Promise<QuoteActionState> {
  const cookieStore = await cookies()
  if (!csrfOk(cookieStore.get(CSRF_COOKIE)?.value, formData)) {
    return { status: 'error', message: 'Your session expired. Refresh and try again.' }
  }
  const user = await requireStaff()
  const invoiceId = String(formData.get('invoiceId') ?? '')
  if (!invoiceId) return { status: 'error', message: 'Missing invoice.' }

  let lines: unknown = []
  let instalments: unknown = []
  try {
    lines = JSON.parse(String(formData.get('lines') ?? '[]'))
    instalments = JSON.parse(String(formData.get('instalments') ?? '[]'))
  } catch {
    return { status: 'error', message: 'Could not read the invoice items.' }
  }
  const parsed = createInvoiceLinesSchema.safeParse({
    type: formData.get('type') ?? '',
    invoiceNumber: formData.get('invoiceNumber') ?? '',
    invoiceDate: formData.get('invoiceDate') ?? '',
    poNumber: formData.get('poNumber') ?? '',
    notes: formData.get('notes') ?? '',
    discount: formData.get('discount') ?? '',
    lines,
    instalments,
  })
  if (!parsed.success) {
    return { status: 'error', message: parsed.error.issues[0]?.message ?? 'Please check the invoice.' }
  }
  try {
    await updateInvoiceWithLines(invoiceId, parsed.data, user.id)
  } catch (error) {
    return { status: 'error', message: error instanceof Error ? error.message : 'Could not save the invoice.' }
  }
  revalidatePath('/finance')
  revalidatePath(`/finance/${invoiceId}`)
  redirect(`/finance/${invoiceId}`)
}

/**
 * Contextual save for the invoice workspace: same as updateInvoiceLinesAction but returns success
 * instead of redirecting, so the client can router.refresh() and keep scroll/section state.
 */
export async function saveInvoiceContentAction(
  _prev: QuoteActionState,
  formData: FormData,
): Promise<QuoteActionState> {
  const cookieStore = await cookies()
  if (!csrfOk(cookieStore.get(CSRF_COOKIE)?.value, formData)) {
    return { status: 'error', message: 'Your session expired. Refresh and try again.' }
  }
  const user = await requireStaff()
  const invoiceId = String(formData.get('invoiceId') ?? '')
  if (!invoiceId) return { status: 'error', message: 'Missing invoice.' }

  let lines: unknown = []
  let instalments: unknown = []
  try {
    lines = JSON.parse(String(formData.get('lines') ?? '[]'))
    instalments = JSON.parse(String(formData.get('instalments') ?? '[]'))
  } catch {
    return { status: 'error', message: 'Could not read the invoice items.' }
  }
  const parsed = createInvoiceLinesSchema.safeParse({
    type: formData.get('type') ?? '',
    invoiceNumber: formData.get('invoiceNumber') ?? '',
    invoiceDate: formData.get('invoiceDate') ?? '',
    poNumber: formData.get('poNumber') ?? '',
    notes: formData.get('notes') ?? '',
    discount: formData.get('discount') ?? '',
    lines,
    instalments,
  })
  if (!parsed.success) {
    return { status: 'error', message: parsed.error.issues[0]?.message ?? 'Please check the invoice.' }
  }
  try {
    await updateInvoiceWithLines(invoiceId, parsed.data, user.id)
  } catch (error) {
    return { status: 'error', message: error instanceof Error ? error.message : 'Could not save the invoice.' }
  }
  revalidatePath('/finance')
  revalidatePath(`/finance/${invoiceId}`)
  return { status: 'success' }
}

/** Refund all or part of a recorded payment. Reverts the invoice balance (domain handles it). */
export async function refundPaymentAction(
  _prev: QuoteActionState,
  formData: FormData,
): Promise<QuoteActionState> {
  const cookieStore = await cookies()
  if (!csrfOk(cookieStore.get(CSRF_COOKIE)?.value, formData)) {
    return { status: 'error', message: 'Your session expired. Refresh and try again.' }
  }
  const user = await requireStaff()
  const paymentId = String(formData.get('paymentId') ?? '')
  const invoiceId = String(formData.get('invoiceId') ?? '')
  const amount = String(formData.get('amount') ?? '')
  const reason = String(formData.get('reason') ?? '').trim() || undefined
  if (!paymentId || !amount) return { status: 'error', message: 'Missing refund details.' }
  try {
    await refundPayment(paymentId, amount, { reason }, user.id)
  } catch (error) {
    return { status: 'error', message: error instanceof Error ? error.message : 'Could not process the refund.' }
  }
  revalidatePath('/finance')
  if (invoiceId) revalidatePath(`/finance/${invoiceId}`)
  return { status: 'success' }
}

/** Void an invoice (issued, unpaid). Refused once any payment exists (domain guards this). */
export async function voidInvoiceAction(formData: FormData): Promise<void> {
  const cookieStore = await cookies()
  if (!csrfOk(cookieStore.get(CSRF_COOKIE)?.value, formData)) return
  const user = await requireStaff()
  const invoiceId = String(formData.get('invoiceId') ?? '')
  if (!invoiceId) return
  await voidInvoice(invoiceId, user.id)
  revalidatePath('/finance')
  revalidatePath(`/finance/${invoiceId}`)
  const projectId = String(formData.get('projectId') ?? '')
  if (projectId) revalidatePath(`/jobs/${projectId}`)
}

export async function createQuestionnaireAction(
  _prev: QuoteActionState,
  formData: FormData,
): Promise<QuoteActionState> {
  const cookieStore = await cookies()
  if (!csrfOk(cookieStore.get(CSRF_COOKIE)?.value, formData)) {
    return { status: 'error', message: 'Your session expired. Refresh and try again.' }
  }
  await requireStaff()
  const projectId = String(formData.get('projectId') ?? '')
  const title = String(formData.get('title') ?? '')
  const questions = String(formData.get('questions') ?? '').split('\n')
  try {
    await createQuestionnaire(projectId, title, questions)
  } catch (error) {
    return { status: 'error', message: error instanceof Error ? error.message : 'Could not create the questionnaire.' }
  }
  revalidatePath(`/jobs/${projectId}`)
  return { status: 'success' }
}

export async function saveInvoiceTemplateAction(formData: FormData): Promise<void> {
  const cookieStore = await cookies()
  if (!csrfOk(cookieStore.get(CSRF_COOKIE)?.value, formData)) throw new Error('Invalid request.')
  await requireStaff()
  let lines: unknown = []
  try {
    lines = JSON.parse(String(formData.get('lines') ?? '[]'))
  } catch {
    return
  }
  if (!Array.isArray(lines) || lines.length === 0) return
  await saveInvoiceTemplate(
    String(formData.get('name') ?? ''),
    lines as { itemName?: string; description: string; quantity: number; unitPrice: string }[],
  )
  const projectId = String(formData.get('projectId') ?? '')
  if (projectId) revalidatePath(`/jobs/${projectId}`)
}

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
  revalidatePath(`/jobs/${projectId}`)
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
  revalidatePath(`/jobs/${projectId}`)
  revalidatePath('/finance')
  revalidatePath(`/finance/${invoiceId}`)
}

/** Delete a draft/unpaid invoice. Refused if it has payments (domain guards this). */
export async function deleteInvoiceAction(formData: FormData): Promise<void> {
  const cookieStore = await cookies()
  if (!csrfOk(cookieStore.get(CSRF_COOKIE)?.value, formData)) return
  const user = await requireStaff()
  const invoiceId = String(formData.get('invoiceId') ?? '')
  if (!invoiceId) return
  await deleteInvoice(invoiceId, user.id)
  revalidatePath('/finance')
  const projectId = String(formData.get('projectId') ?? '')
  if (projectId) revalidatePath(`/jobs/${projectId}`)
  const clientId = String(formData.get('clientId') ?? '')
  if (clientId) revalidatePath(`/clients/${clientId}`)
  const back = String(formData.get('back') ?? '')
  if (back) redirect(back)
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
  revalidatePath(`/jobs/${projectId}`)
  revalidatePath('/finance')
  revalidatePath(`/finance/${invoiceId}`)
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
  revalidatePath(`/jobs/${projectId}`)
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
  revalidatePath(`/jobs/${projectId}`)
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
  revalidatePath(`/jobs/${projectId}`)
}

/** A yyyy-mm-dd form value to a Date, or null. */
function parseDue(formData: FormData): Date | null {
  const raw = String(formData.get('dueAt') ?? '').trim()
  if (!raw) return null
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Toggle a workflow task on a project (tick to complete, tick again to reopen). Backend + audit. */
export async function toggleProjectTaskAction(formData: FormData): Promise<void> {
  const cookieStore = await cookies()
  if (!csrfOk(cookieStore.get(CSRF_COOKIE)?.value, formData)) return
  const user = await requireStaff()
  const projectId = String(formData.get('projectId') ?? '')
  const workItemId = String(formData.get('workItemId') ?? '')
  if (!projectId || !workItemId) return
  try {
    await toggleProjectTask(workItemId, user.id)
  } catch {
    // Double submit / stale id: the re-render shows the real state.
  }
  revalidatePath(`/jobs/${projectId}`)
}

/** Add a task to a stage of the project's workflow. */
export async function addProjectTaskAction(formData: FormData): Promise<void> {
  const cookieStore = await cookies()
  if (!csrfOk(cookieStore.get(CSRF_COOKIE)?.value, formData)) return
  const user = await requireStaff()
  const projectId = String(formData.get('projectId') ?? '')
  const stage = String(formData.get('stage') ?? '')
  const title = String(formData.get('title') ?? '')
  const type = String(formData.get('type') ?? 'TODO')
  if (!projectId || !stage || !title.trim()) return
  try {
    await addProjectTask(projectId, stage, title, type, parseDue(formData), user.id)
  } catch {
    // Invalid stage / empty title: the re-render shows the real state.
  }
  revalidatePath(`/jobs/${projectId}`)
}

/** Rename a task and/or change its due date. */
export async function updateProjectTaskAction(formData: FormData): Promise<void> {
  const cookieStore = await cookies()
  if (!csrfOk(cookieStore.get(CSRF_COOKIE)?.value, formData)) return
  const user = await requireStaff()
  const projectId = String(formData.get('projectId') ?? '')
  const workItemId = String(formData.get('workItemId') ?? '')
  const title = String(formData.get('title') ?? '')
  if (!projectId || !workItemId || !title.trim()) return
  try {
    await updateProjectTask(workItemId, title, parseDue(formData), user.id)
  } catch {
    // no-op on stale id
  }
  revalidatePath(`/jobs/${projectId}`)
}

/** Delete a task from the project's workflow. */
export async function deleteProjectTaskAction(formData: FormData): Promise<void> {
  const cookieStore = await cookies()
  if (!csrfOk(cookieStore.get(CSRF_COOKIE)?.value, formData)) return
  const user = await requireStaff()
  const projectId = String(formData.get('projectId') ?? '')
  const workItemId = String(formData.get('workItemId') ?? '')
  if (!projectId || !workItemId) return
  try {
    await deleteProjectTask(workItemId, user.id)
  } catch {
    // no-op on stale id
  }
  revalidatePath(`/jobs/${projectId}`)
}

/** Insert the default task block for an optional stage (per package). */
export async function addProjectStageBlockAction(formData: FormData): Promise<void> {
  const cookieStore = await cookies()
  if (!csrfOk(cookieStore.get(CSRF_COOKIE)?.value, formData)) return
  const user = await requireStaff()
  const projectId = String(formData.get('projectId') ?? '')
  const stage = String(formData.get('stage') ?? '')
  if (!projectId || !stage) return
  try {
    await addProjectStageBlock(projectId, stage, user.id)
  } catch {
    // not an optional stage / already populated: no-op
  }
  revalidatePath(`/jobs/${projectId}`)
}

/** Move a task up or down within its stage. */
export async function moveProjectTaskAction(formData: FormData): Promise<void> {
  const cookieStore = await cookies()
  if (!csrfOk(cookieStore.get(CSRF_COOKIE)?.value, formData)) return
  const user = await requireStaff()
  const projectId = String(formData.get('projectId') ?? '')
  const workItemId = String(formData.get('workItemId') ?? '')
  const direction = String(formData.get('direction') ?? '') === 'up' ? 'up' : 'down'
  if (!projectId || !workItemId) return
  try {
    await moveProjectTask(workItemId, direction, user.id)
  } catch {
    // no-op on stale id
  }
  revalidatePath(`/jobs/${projectId}`)
}

/** Staff records a reply sent to the client on a project (outbound Communication). */
export async function sendProjectReplyAction(formData: FormData): Promise<void> {
  const cookieStore = await cookies()
  if (!csrfOk(cookieStore.get(CSRF_COOKIE)?.value, formData)) return
  const user = await requireStaff()
  const projectId = String(formData.get('projectId') ?? '')
  const body = String(formData.get('body') ?? '').trim()
  if (!projectId || !body) return
  await logCommunication(projectId, {
    type: 'CLIENT_MESSAGE',
    direction: 'outbound',
    body,
    byUserId: user.id,
  })
  revalidatePath(`/jobs/${projectId}`)
}

/** Staff records a message received from the client on a project (inbound Communication). */
export async function logProjectClientReplyAction(formData: FormData): Promise<void> {
  const cookieStore = await cookies()
  if (!csrfOk(cookieStore.get(CSRF_COOKIE)?.value, formData)) return
  await requireStaff()
  const projectId = String(formData.get('projectId') ?? '')
  const body = String(formData.get('body') ?? '').trim()
  if (!projectId || !body) return
  await logCommunication(projectId, {
    type: 'CLIENT_MESSAGE',
    direction: 'inbound',
    body,
  })
  revalidatePath(`/jobs/${projectId}`)
}

export type StaffEnquiryState =
  | { status: 'idle' }
  | {
      status: 'error'
      message?: string
      errors?: { name?: string; email?: string; phone?: string; message?: string }
    }

/** Staff log an enquiry that arrived by phone, email, or the company website, then open the project. */
export async function createStaffEnquiryAction(
  _prev: StaffEnquiryState,
  formData: FormData,
): Promise<StaffEnquiryState> {
  const cookieStore = await cookies()
  if (!csrfOk(cookieStore.get(CSRF_COOKIE)?.value, formData)) {
    return { status: 'error', message: 'Your session expired. Refresh and try again.' }
  }
  await requireStaff()

  const parsed = enquirySchema.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
    phone: formData.get('phone') ?? '',
    eventType: formData.get('eventType') ?? '',
    message: formData.get('message') ?? '',
    source: 'staff',
  })
  if (!parsed.success) {
    const fields = parsed.error.flatten().fieldErrors
    return {
      status: 'error',
      errors: {
        name: fields.name?.[0],
        email: fields.email?.[0],
        phone: fields.phone?.[0],
        message: fields.message?.[0],
      },
    }
  }

  let projectId: string
  try {
    const project = await createProjectFromEnquiry(parsed.data)
    projectId = project.id
  } catch {
    return { status: 'error', message: 'Could not create the job. Please try again.' }
  }
  redirect(`/jobs/${projectId}`)
}
