'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { appBaseUrl } from '@/lib/app-url'
import { CSRF_COOKIE, verifyCsrf } from '@/lib/auth/csrf'
import { can } from '@/lib/auth/authz'
import { getActionUser } from '@/lib/auth/guard'
import { prisma } from '@/lib/db'
import { sydneyLocalToUtc } from '@/lib/time'
import { assignResource, createBooking } from '@/lib/domain/booking'
import { logCommunication } from '@/lib/domain/communication'
import { closeJob, createProjectFromEnquiry } from '@/lib/domain/project'
import {
  addProjectStage,
  addProjectStageBlock,
  addProjectTask,
  deleteProjectStage,
  deleteProjectTask,
  moveProjectTask,
  renameProjectStage,
  toggleProjectTask,
  updateProjectTask,
} from '@/lib/domain/project-workflow'
import { enquirySchema } from '@/lib/validation/enquiry'
import { createContractFromAcceptedQuote, sendContract } from '@/lib/domain/contract'
import { addGalleryItem, createGallery, publishGallery } from '@/lib/domain/delivery'
import { createInvoice, createInvoiceWithLines, deleteInvoice, issueInvoice, recordPayment, saveInvoiceTemplate, updateInvoiceWithLines, voidInvoice } from '@/lib/domain/finance'
import { refundPayment } from '@/lib/domain/refund'
import { createPackage } from '@/lib/domain/package'
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
  const user = await getActionUser()
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

/**
 * Close a delivered job (COMPLETED -> CLOSED) once it is settled and all tasks are done. Guarded in
 * the domain; the button only shows when closeable, so a guard failure just leaves the state unchanged.
 */
export async function closeJobAction(formData: FormData): Promise<void> {
  const cookieStore = await cookies()
  if (!csrfOk(cookieStore.get(CSRF_COOKIE)?.value, formData)) return
  const user = await requireStaff()
  const projectId = String(formData.get('projectId') ?? '')
  if (!projectId) return
  try {
    await closeJob(projectId, user.id)
  } catch {
    // Balance outstanding or tasks pending - leave the job as-is; the page reflects the real state.
  }
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

  const parsed = saveQuoteSchema.safeParse({
    lines,
    reference: formData.get('reference') ?? '',
    issueDate: formData.get('issueDate') ?? '',
    validUntil: formData.get('validUntil') ?? '',
    poNumber: formData.get('poNumber') ?? '',
    notes: formData.get('notes') ?? '',
    depositPercent: formData.get('depositPercent') ?? '',
  })
  if (!parsed.success) {
    return { status: 'error', message: parsed.error.issues[0]?.message ?? 'Please check the quote.' }
  }
  const validUntil = parsed.data.validUntil ? new Date(parsed.data.validUntil) : null

  try {
    await saveQuoteDraft(versionId, parsed.data.lines, validUntil, {
      poNumber: parsed.data.poNumber,
      notes: parsed.data.notes,
      depositPercent: parsed.data.depositPercent,
      reference: parsed.data.reference,
      issueDate: new Date(parsed.data.issueDate),
    })
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
  let recipient = ''
  if (quote?.project) {
    recipient = quote.project.client.email ?? ''
    const base = await appBaseUrl()
    await sendQuoteEmail({
      to: quote.project.client.email,
      clientName: quote.project.client.displayName,
      quoteLink: `${base}/quote/${viewToken}`,
    })
  }
  revalidatePath(`/jobs/${projectId}`)
  // Redirect (not a success state) so the "Quote sent" toast is owned by the job page: a successful send
  // flips the quote out of DRAFT and unmounts the builder, which would destroy any toast it rendered.
  redirect(`/jobs/${projectId}?sent=${encodeURIComponent(recipient)}`)
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
    const base = await appBaseUrl()
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
    discountReason: formData.get('discountReason') ?? '',
    lines,
    instalments,
    // New invoice form: editable billing contact + job label + due rule (all optional).
    billingName: formData.get('billingName') ?? '',
    billingEmail: formData.get('billingEmail') ?? '',
    billingPhone: formData.get('billingPhone') ?? '',
    jobName: formData.get('jobName') ?? '',
    due: formData.get('due') || undefined,
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
  redirect(`/finance/${created.id}?toast=invoice-created`)
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
    discountReason: formData.get('discountReason') ?? '',
    lines,
    instalments,
    // Edit invoice (full form): the billing snapshot + due rule, when the form sends them.
    billingName: formData.get('billingName') ?? undefined,
    billingEmail: formData.get('billingEmail') ?? undefined,
    billingPhone: formData.get('billingPhone') ?? undefined,
    jobName: formData.get('jobName') ?? undefined,
    due: formData.get('due') || undefined,
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
  redirect(`/finance/${invoiceId}?toast=invoice-updated`)
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
  if (!can(user, 'MONEY_ADMIN')) return { status: 'error', message: 'Only an admin can refund a payment.' }
  const paymentId = String(formData.get('paymentId') ?? '')
  const invoiceId = String(formData.get('invoiceId') ?? '')
  const amount = String(formData.get('amount') ?? '')
  const reason = String(formData.get('reason') ?? '').trim() || undefined
  if (!paymentId || !amount) return { status: 'error', message: 'Missing refund details.' }
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(amount.trim()) || Number(amount) <= 0) {
    return { status: 'error', message: 'Please enter the refund as an amount like 250 or 250.00.' }
  }
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
  if (!can(user, 'MONEY_ADMIN')) return // ADMIN only (docs/33 §2); the button is hidden for others
  const invoiceId = String(formData.get('invoiceId') ?? '')
  if (!invoiceId) return
  try {
    await voidInvoice(invoiceId, user.id)
  } catch {
    // Refused (e.g. money recorded since the page loaded): the re-render shows the real state.
  }
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

/** Save a one-off custom charge back to the reusable package catalogue ("Save this item for reuse"). */
export async function saveReusableItemAction(formData: FormData): Promise<void> {
  const cookieStore = await cookies()
  if (!csrfOk(cookieStore.get(CSRF_COOKIE)?.value, formData)) return
  const user = await requireStaff()
  const name = String(formData.get('name') ?? '').trim()
  const price = String(formData.get('unitPrice') ?? '').trim()
  if (!name || !/^\d+(\.\d{1,2})?$/.test(price)) return
  const description = String(formData.get('description') ?? '').trim()
  await createPackage({ name, inclusions: description || null, basePriceInclGst: price }, user.id)
  revalidatePath('/finance')
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
  if (!can(user, 'MONEY_ADMIN')) return // ADMIN only (docs/33 §2); the button is hidden for others
  const invoiceId = String(formData.get('invoiceId') ?? '')
  if (!invoiceId) return
  try {
    await deleteInvoice(invoiceId, user.id)
  } catch {
    // Refused (payment history): nothing was deleted; the re-render shows the invoice as it is.
    revalidatePath(`/finance/${invoiceId}`)
    return
  }
  revalidatePath('/finance')
  const projectId = String(formData.get('projectId') ?? '')
  if (projectId) revalidatePath(`/jobs/${projectId}`)
  const clientId = String(formData.get('clientId') ?? '')
  if (clientId) revalidatePath(`/clients/${clientId}`)
  // Only an in-app path: a single leading "/" (never "//host" or a full URL), so it can't redirect off-site.
  const back = String(formData.get('back') ?? '')
  if (/^\/(?!\/)/.test(back)) redirect(back)
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

/** Combine the form's date (yyyy-mm-dd) and time (HH:mm) into a UTC instant, read as Sydney wall-clock
 *  so the calendar can place the task in the right slot. Null when no date was given; a missing time
 *  falls back to 9am. */
function parseDue(formData: FormData): Date | null {
  const date = String(formData.get('dueAt') ?? '').trim()
  if (!date) return null
  const time = String(formData.get('dueTime') ?? '').trim() || '09:00'
  const d = sydneyLocalToUtc(`${date}T${time}`)
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
  revalidatePath('/jobs') // the list's "Next task" column follows the first pending task
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

/** Add a per-project custom stage (seeded with a starter task so the group persists). */
export async function addProjectStageAction(formData: FormData): Promise<void> {
  const cookieStore = await cookies()
  if (!csrfOk(cookieStore.get(CSRF_COOKIE)?.value, formData)) return
  const user = await requireStaff()
  const projectId = String(formData.get('projectId') ?? '')
  const name = String(formData.get('stageName') ?? '')
  if (!projectId || !name.trim()) return
  try {
    await addProjectStage(projectId, name, user.id)
  } catch {
    // no-op on empty / duplicate / core-name stage
  }
  revalidatePath(`/jobs/${projectId}`)
}

/** Rename a custom stage (re-keys its tasks). Core stages are rejected in the domain. */
export async function renameProjectStageAction(formData: FormData): Promise<void> {
  const cookieStore = await cookies()
  if (!csrfOk(cookieStore.get(CSRF_COOKIE)?.value, formData)) return
  const user = await requireStaff()
  const projectId = String(formData.get('projectId') ?? '')
  const fromStage = String(formData.get('fromStage') ?? '')
  const toStage = String(formData.get('toStage') ?? '')
  if (!projectId || !fromStage || !toStage.trim()) return
  try {
    await renameProjectStage(projectId, fromStage, toStage, user.id)
  } catch {
    // no-op on core stage / invalid name
  }
  revalidatePath(`/jobs/${projectId}`)
}

/** Delete a custom stage and its tasks. Core stages are rejected in the domain. */
export async function deleteProjectStageAction(formData: FormData): Promise<void> {
  const cookieStore = await cookies()
  if (!csrfOk(cookieStore.get(CSRF_COOKIE)?.value, formData)) return
  const user = await requireStaff()
  const projectId = String(formData.get('projectId') ?? '')
  const stage = String(formData.get('stage') ?? '')
  if (!projectId || !stage) return
  try {
    await deleteProjectStage(projectId, stage, user.id)
  } catch {
    // no-op on core stage
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

// ---------------------------------------------------------------------------
// Job Overview: client requirements, moodboard, assigned team, internal notes.
// All plain form actions guarded by CSRF + staff role; they refresh the job page.
// ---------------------------------------------------------------------------

/** Add a confirmed client requirement (label + detail) to a job. */
export async function addRequirementAction(formData: FormData): Promise<void> {
  const cookieStore = await cookies()
  if (!csrfOk(cookieStore.get(CSRF_COOKIE)?.value, formData)) return
  await requireStaff()
  const projectId = String(formData.get('projectId') ?? '')
  const label = String(formData.get('label') ?? '').trim()
  const detail = String(formData.get('detail') ?? '').trim()
  if (!projectId || !label || !detail) return
  const sortOrder = await prisma.projectRequirement.count({ where: { projectId } })
  await prisma.projectRequirement.create({ data: { projectId, label, detail, sortOrder } })
  revalidatePath(`/jobs/${projectId}`)
}

/** Remove a client requirement. */
export async function deleteRequirementAction(formData: FormData): Promise<void> {
  const cookieStore = await cookies()
  if (!csrfOk(cookieStore.get(CSRF_COOKIE)?.value, formData)) return
  await requireStaff()
  const projectId = String(formData.get('projectId') ?? '')
  const id = String(formData.get('requirementId') ?? '')
  if (!projectId || !id) return
  await prisma.projectRequirement.deleteMany({ where: { id, projectId } })
  revalidatePath(`/jobs/${projectId}`)
}

/** Promote a client message into a confirmed requirement ("Add to requirements"). */
export async function addMessageToRequirementsAction(formData: FormData): Promise<void> {
  const cookieStore = await cookies()
  if (!csrfOk(cookieStore.get(CSRF_COOKIE)?.value, formData)) return
  await requireStaff()
  const projectId = String(formData.get('projectId') ?? '')
  const communicationId = String(formData.get('communicationId') ?? '')
  if (!projectId || !communicationId) return
  const message = await prisma.communication.findFirst({ where: { id: communicationId, projectId }, select: { body: true } })
  if (!message) return
  const sortOrder = await prisma.projectRequirement.count({ where: { projectId } })
  await prisma.projectRequirement.create({ data: { projectId, label: 'Client request', detail: message.body, sortOrder } })
  revalidatePath(`/jobs/${projectId}`)
}

/** Add a moodboard image or reference link to a job. */
export async function addMoodboardItemAction(formData: FormData): Promise<void> {
  const cookieStore = await cookies()
  if (!csrfOk(cookieStore.get(CSRF_COOKIE)?.value, formData)) return
  await requireStaff()
  const projectId = String(formData.get('projectId') ?? '')
  const url = String(formData.get('url') ?? '').trim()
  const caption = String(formData.get('caption') ?? '').trim() || null
  const kind = String(formData.get('kind') ?? 'image') === 'link' ? 'link' : 'image'
  if (!projectId || !url) return
  const sortOrder = await prisma.moodboardItem.count({ where: { projectId } })
  await prisma.moodboardItem.create({ data: { projectId, url, caption, kind, sortOrder } })
  revalidatePath(`/jobs/${projectId}`)
}

/** Remove a moodboard item. */
export async function deleteMoodboardItemAction(formData: FormData): Promise<void> {
  const cookieStore = await cookies()
  if (!csrfOk(cookieStore.get(CSRF_COOKIE)?.value, formData)) return
  await requireStaff()
  const projectId = String(formData.get('projectId') ?? '')
  const id = String(formData.get('itemId') ?? '')
  if (!projectId || !id) return
  await prisma.moodboardItem.deleteMany({ where: { id, projectId } })
  revalidatePath(`/jobs/${projectId}`)
}

/** Add a team member (optionally linked to a resource) with a role. */
export async function addTeamMemberAction(formData: FormData): Promise<void> {
  const cookieStore = await cookies()
  if (!csrfOk(cookieStore.get(CSRF_COOKIE)?.value, formData)) return
  await requireStaff()
  const projectId = String(formData.get('projectId') ?? '')
  const role = String(formData.get('role') ?? '').trim()
  const resourceId = String(formData.get('resourceId') ?? '').trim() || null
  let name = String(formData.get('name') ?? '').trim()
  if (!projectId || !role) return
  if (resourceId && !name) {
    const resource = await prisma.resource.findFirst({ where: { id: resourceId }, select: { name: true } })
    name = resource?.name ?? ''
  }
  if (!name) return
  const sortOrder = await prisma.projectTeamMember.count({ where: { projectId } })
  await prisma.projectTeamMember.create({ data: { projectId, resourceId, name, role, sortOrder } })
  revalidatePath(`/jobs/${projectId}`)
}

/** Remove a team member from a job. */
export async function removeTeamMemberAction(formData: FormData): Promise<void> {
  const cookieStore = await cookies()
  if (!csrfOk(cookieStore.get(CSRF_COOKIE)?.value, formData)) return
  await requireStaff()
  const projectId = String(formData.get('projectId') ?? '')
  const id = String(formData.get('memberId') ?? '')
  if (!projectId || !id) return
  await prisma.projectTeamMember.deleteMany({ where: { id, projectId } })
  revalidatePath(`/jobs/${projectId}`)
}

/** Add an internal team note (not client-facing) to a job's activity feed. */
export async function addInternalNoteAction(formData: FormData): Promise<void> {
  const cookieStore = await cookies()
  if (!csrfOk(cookieStore.get(CSRF_COOKIE)?.value, formData)) return
  const user = await requireStaff()
  const projectId = String(formData.get('projectId') ?? '')
  const body = String(formData.get('body') ?? '').trim()
  if (!projectId || !body) return
  await prisma.communication.create({
    data: { projectId, type: 'NOTE', direction: 'internal', internal: true, body, byUserId: user.id },
  })
  revalidatePath(`/jobs/${projectId}`)
}

/** Update the client's extra contact details shown on the Overview (partner, preferred, instagram, phone, notes). */
export async function updateClientContactAction(formData: FormData): Promise<void> {
  const cookieStore = await cookies()
  if (!csrfOk(cookieStore.get(CSRF_COOKIE)?.value, formData)) return
  await requireStaff()
  const projectId = String(formData.get('projectId') ?? '')
  const clientId = String(formData.get('clientId') ?? '')
  if (!projectId || !clientId) return
  const str = (k: string) => {
    const v = String(formData.get(k) ?? '').trim()
    return v.length > 0 ? v : null
  }
  await prisma.client.update({
    where: { id: clientId },
    data: {
      partnerName: str('partnerName'),
      preferredContact: str('preferredContact'),
      instagram: str('instagram'),
      phone: str('phone'),
    },
  })
  revalidatePath(`/jobs/${projectId}`)
}

/** Edit an internal team note; records which staff edited it and when (shown as a small line). */
export async function editInternalNoteAction(formData: FormData): Promise<void> {
  const cookieStore = await cookies()
  if (!csrfOk(cookieStore.get(CSRF_COOKIE)?.value, formData)) return
  const user = await requireStaff()
  const projectId = String(formData.get('projectId') ?? '')
  const communicationId = String(formData.get('communicationId') ?? '')
  const body = String(formData.get('body') ?? '').trim()
  if (!projectId || !communicationId || !body) return
  await prisma.communication.updateMany({
    where: { id: communicationId, projectId, internal: true },
    data: { body, editedByUserId: user.id, editedAt: new Date() },
  })
  revalidatePath(`/jobs/${projectId}`)
}

/** Delete an internal team note. */
export async function deleteInternalNoteAction(formData: FormData): Promise<void> {
  const cookieStore = await cookies()
  if (!csrfOk(cookieStore.get(CSRF_COOKIE)?.value, formData)) return
  await requireStaff()
  const projectId = String(formData.get('projectId') ?? '')
  const communicationId = String(formData.get('communicationId') ?? '')
  if (!projectId || !communicationId) return
  await prisma.communication.deleteMany({ where: { id: communicationId, projectId, internal: true } })
  revalidatePath(`/jobs/${projectId}`)
}
