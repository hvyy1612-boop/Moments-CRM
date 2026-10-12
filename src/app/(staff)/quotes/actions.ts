'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { appBaseUrl } from '@/lib/app-url'
import { CSRF_COOKIE, verifyCsrf } from '@/lib/auth/csrf'
import { can } from '@/lib/auth/authz'
import { getActionUser } from '@/lib/auth/guard'
import { createQuoteForEnquiry, saveQuoteDraft, sendQuote, acceptQuote, reviseQuote, deleteQuotes, declineQuote } from '@/lib/domain/quote'
import { saveQuoteSchema } from '@/lib/validation/quote'
import { sendComposedQuoteEmail } from '@/lib/email'

/**
 * Server actions for the Enquiry-stage Quotes feature (docs/31). Thin wrappers over the quote domain:
 * check CSRF + staff, call the domain, refresh/redirect. Quote acceptance is the single staff command
 * that converts the enquiry into a Job.
 */

export type QuoteActionState = { status: 'idle' } | { status: 'success' } | { status: 'error'; message: string }

async function requireStaff() {
  const user = await getActionUser()
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
    redirect(`/leads/${enquiryId}?quoteError=1`)
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
    poNumber: formData.get('poNumber') ?? '',
    notes: formData.get('notes') ?? '',
    depositPercent: formData.get('depositPercent') ?? '',
  })
  if (!parsed.success) return { status: 'error', message: parsed.error.issues[0]?.message ?? 'Please check the quote.' }
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
  if (quoteId) revalidatePath(`/quotes/${quoteId}`)
  // The Edit-quote page asks (via redirectToDetail) to return to the read-only detail after saving,
  // matching the invoice editor. The job-detail inline builder omits the flag and stays put (its own
  // client toast confirms the save). The target is built from quoteId, never a client-supplied path.
  if (quoteId && str(formData, 'redirectToDetail') === '1') {
    redirect(`/quotes/${quoteId}?toast=quote-updated`)
  }
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
    const base = await appBaseUrl()
    await sendComposedQuoteEmail({ to, subject, body: message, quoteLink: `${base}/quote/${viewToken}` })
  }
  revalidatePath(`/quotes/${quoteId}`)
  // Redirect (not a success state) so the "Quote sent" toast is owned by the stable detail page: after a
  // send the quote leaves DRAFT and the editor unmounts, which would destroy any toast it rendered.
  redirect(`/quotes/${quoteId}?sent=${encodeURIComponent(to)}`)
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

/** Mark a sent quote as declined (the client said no). Reason is kept simple (OTHER) - no picker. Only a
 *  SENT/VIEWED quote can be declined; the domain enforces that and refuses an accepted one. */
export async function declineQuoteAction(formData: FormData): Promise<void> {
  const cookieStore = await cookies()
  if (!csrfOk(cookieStore.get(CSRF_COOKIE)?.value, formData)) return
  const user = await requireStaff()
  const quoteId = str(formData, 'quoteId')
  if (!quoteId) return
  try {
    await declineQuote(quoteId, user.id)
  } catch (error) {
    redirect(`/quotes/${quoteId}?declineError=${encodeURIComponent(error instanceof Error ? error.message : 'Could not decline the quote.')}`)
  }
  revalidatePath(`/quotes/${quoteId}`)
  redirect(`/quotes/${quoteId}?toast=quote-declined`)
}

/** Accept the quote. A lead's quote opens its booking file and the lead moves to "Awaiting booking
 *  confirmation" (still a lead until the deposit is paid), so staff land back on the lead to raise the
 *  deposit invoice; a job's own quote is accepted in place and stays on the job. */
export async function acceptQuoteAction(formData: FormData): Promise<void> {
  const cookieStore = await cookies()
  if (!csrfOk(cookieStore.get(CSRF_COOKIE)?.value, formData)) return
  const user = await requireStaff()
  const quoteId = str(formData, 'quoteId')
  if (!quoteId) return
  let projectId: string | null = null
  let enquiryId: string | null = null
  try {
    const res = await acceptQuote(quoteId, user.id)
    projectId = res.projectId
    enquiryId = res.enquiryId
  } catch (error) {
    redirect(`/quotes/${quoteId}?acceptError=${encodeURIComponent(error instanceof Error ? error.message : 'Could not accept the quote.')}`)
  }
  revalidatePath(`/quotes/${quoteId}`)
  redirect((enquiryId ? `/leads/${enquiryId}` : projectId ? `/jobs/${projectId}` : `/quotes/${quoteId}`) + '?toast=quote-accepted')
}

/** Batch-delete the selected quotes from the list (accepted quotes are protected in the domain). Void
 *  form action: the confirm + the selection live in the client toolbar; here we just verify and refresh. */
export async function deleteQuotesAction(formData: FormData): Promise<void> {
  const cookieStore = await cookies()
  if (!csrfOk(cookieStore.get(CSRF_COOKIE)?.value, formData)) return
  const user = await requireStaff()
  if (!can(user, 'MONEY_ADMIN')) return // deleting quotes is ADMIN only (docs/33 §2)
  const ids = str(formData, 'ids').split(',').map((s) => s.trim()).filter(Boolean)
  if (ids.length === 0) return
  try {
    await deleteQuotes(ids)
  } catch {
    // fall through to refresh
  }
  revalidatePath('/quotes')
  redirect('/quotes?toast=quotes-deleted')
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
  redirect(`/quotes/${quoteId}/edit?toast=quote-revised`)
}
