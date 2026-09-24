'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { CSRF_COOKIE, verifyCsrf } from '@/lib/auth/csrf'
import { getSessionUser } from '@/lib/auth/guard'
import { createQuoteForEnquiry, saveQuoteDraft, sendQuote, acceptQuote, reviseQuote, duplicateQuote } from '@/lib/domain/quote'
import { saveQuoteSchema } from '@/lib/validation/quote'
import { sendComposedQuoteEmail } from '@/lib/email'

/**
 * Server actions for the Enquiry-stage Quotes feature (docs/31). Thin wrappers over the quote domain:
 * check CSRF + staff, call the domain, refresh/redirect. Quote acceptance is the single staff command
 * that converts the enquiry into a Job.
 */

export type QuoteActionState = { status: 'idle' } | { status: 'success' } | { status: 'error'; message: string }

async function requireStaff() {
  const user = await getSessionUser()
  if (!user || (user.role !== 'ADMIN' && user.role !== 'STUDIO')) throw new Error('Not authorised.')
  return user
}
function csrfOk(cookieValue: string | undefined, formData: FormData): boolean {
  return verifyCsrf(cookieValue, formData.get('csrf'))
}
const str = (fd: FormData, k: string) => String(fd.get(k) ?? '')

/** Create a draft quote for an enquiry, then open its builder. */
export async function createQuoteForEnquiryAction(formData: FormData): Promise<void> {
  const cookieStore = await cookies()
  if (!csrfOk(cookieStore.get(CSRF_COOKIE)?.value, formData)) return
  const user = await requireStaff()
  const enquiryId = str(formData, 'enquiryId').trim()
  if (!enquiryId) return
  let quoteId: string
  try {
    const res = await createQuoteForEnquiry(enquiryId, user.id)
    quoteId = res.quoteId
  } catch {
    redirect(`/enquiries/${enquiryId}?quoteError=1`)
  }
  redirect(`/quotes/${quoteId}/edit`)
}

/** Save the draft (lines + presentation). Matches QuoteBuilder's action signature. */
export async function saveQuoteAction(_prev: QuoteActionState, formData: FormData): Promise<QuoteActionState> {
  const cookieStore = await cookies()
  if (!csrfOk(cookieStore.get(CSRF_COOKIE)?.value, formData)) {
    return { status: 'error', message: 'Your session expired. Refresh and try again.' }
  }
  await requireStaff()
  const versionId = str(formData, 'versionId')
  const quoteId = str(formData, 'quoteId')
  let lines: unknown
  try {
    lines = JSON.parse(str(formData, 'linesJson') || '[]')
  } catch {
    return { status: 'error', message: 'Could not read the quote lines.' }
  }
  const parsed = saveQuoteSchema.safeParse({
    lines,
    reference: formData.get('reference') ?? '',
    issueDate: formData.get('issueDate') ?? '',
    validUntil: formData.get('validUntil') ?? '',
    introduction: formData.get('introduction') ?? '',
    poNumber: formData.get('poNumber') ?? '',
    notes: formData.get('notes') ?? '',
    depositPercent: formData.get('depositPercent') ?? '',
  })
  if (!parsed.success) return { status: 'error', message: parsed.error.issues[0]?.message ?? 'Please check the quote.' }
  const validUntil = parsed.data.validUntil ? new Date(parsed.data.validUntil) : null
  try {
    await saveQuoteDraft(versionId, parsed.data.lines, validUntil, {
      introduction: parsed.data.introduction,
      poNumber: parsed.data.poNumber,
      notes: parsed.data.notes,
      depositPercent: parsed.data.depositPercent,
      reference: parsed.data.reference,
      issueDate: new Date(parsed.data.issueDate),
    })
  } catch (error) {
    return { status: 'error', message: error instanceof Error ? error.message : 'Could not save.' }
  }
  if (quoteId) revalidatePath(`/quotes/${quoteId}`)
  return { status: 'success' }
}

/** Mark the quote SENT, then email the client the staff-composed message. Matches QuoteBuilder's action
 *  signature. Emailing is graceful: with no provider configured it records intent only (never throws). */
export async function sendQuoteAction(_prev: QuoteActionState, formData: FormData): Promise<QuoteActionState> {
  const cookieStore = await cookies()
  if (!csrfOk(cookieStore.get(CSRF_COOKIE)?.value, formData)) {
    return { status: 'error', message: 'Your session expired. Refresh and try again.' }
  }
  const user = await requireStaff()
  const quoteId = str(formData, 'quoteId')
  if (!quoteId) return { status: 'error', message: 'Missing quote.' }
  const to = str(formData, 'to').trim()
  const subject = str(formData, 'subject')
  const message = str(formData, 'message')
  let viewToken: string | null = null
  try {
    const result = await sendQuote(quoteId, user.id)
    viewToken = result?.viewToken ?? null
  } catch (error) {
    return { status: 'error', message: error instanceof Error ? error.message : 'Could not send.' }
  }
  if (to && viewToken) {
    const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
    await sendComposedQuoteEmail({ to, subject, body: message, quoteLink: `${base}/quote/${viewToken}` })
  }
  revalidatePath(`/quotes/${quoteId}`)
  return { status: 'success' }
}

/** Share/send the quote from the detail page (void form action): mark it SENT, then refresh the detail.
 *  This does NOT send an email (no provider); the detail page shows a copy-able client link. */
export async function shareQuoteAction(formData: FormData): Promise<void> {
  const cookieStore = await cookies()
  if (!csrfOk(cookieStore.get(CSRF_COOKIE)?.value, formData)) return
  const user = await requireStaff()
  const quoteId = str(formData, 'quoteId')
  if (!quoteId) return
  try {
    await sendQuote(quoteId, user.id)
  } catch (error) {
    redirect(`/quotes/${quoteId}?shareError=${encodeURIComponent(error instanceof Error ? error.message : 'Could not share.')}`)
  }
  revalidatePath(`/quotes/${quoteId}`)
  redirect(`/quotes/${quoteId}`)
}

/** Accept the quote → convert the enquiry into a Job (one transaction), then open the new Job. */
export async function acceptQuoteAction(formData: FormData): Promise<void> {
  const cookieStore = await cookies()
  if (!csrfOk(cookieStore.get(CSRF_COOKIE)?.value, formData)) return
  const user = await requireStaff()
  const quoteId = str(formData, 'quoteId')
  if (!quoteId) return
  let projectId: string | null = null
  try {
    const res = await acceptQuote(quoteId, user.id)
    projectId = res.projectId
  } catch (error) {
    redirect(`/quotes/${quoteId}?acceptError=${encodeURIComponent(error instanceof Error ? error.message : 'Could not accept the quote.')}`)
  }
  revalidatePath(`/quotes/${quoteId}`)
  redirect(projectId ? `/jobs/${projectId}` : `/quotes/${quoteId}`)
}

/** Duplicate a quote as a fresh DRAFT, then open its editor. */
export async function duplicateQuoteAction(formData: FormData): Promise<void> {
  const cookieStore = await cookies()
  if (!csrfOk(cookieStore.get(CSRF_COOKIE)?.value, formData)) return
  const user = await requireStaff()
  const quoteId = str(formData, 'quoteId')
  if (!quoteId) return
  let newId: string
  try {
    const res = await duplicateQuote(quoteId, user.id)
    newId = res.quoteId
  } catch {
    redirect(`/quotes/${quoteId}`)
  }
  redirect(`/quotes/${newId}/edit`)
}

/** Revise a sent quote: a new DRAFT version supersedes the current one. */
export async function reviseQuoteAction(formData: FormData): Promise<void> {
  const cookieStore = await cookies()
  if (!csrfOk(cookieStore.get(CSRF_COOKIE)?.value, formData)) return
  const user = await requireStaff()
  const quoteId = str(formData, 'quoteId')
  if (!quoteId) return
  try {
    await reviseQuote(quoteId, user.id)
  } catch {
    // fall through to refresh
  }
  revalidatePath(`/quotes/${quoteId}`)
  redirect(`/quotes/${quoteId}/edit`)
}
