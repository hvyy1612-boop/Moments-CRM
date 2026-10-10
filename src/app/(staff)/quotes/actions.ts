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

  if (quoteId && str(formData, 'redirectToDetail') === '1') {
    redirect(`/quotes/${quoteId}?toast=quote-updated`)
  }
  return { status: 'success' }
}

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

  redirect(`/quotes/${quoteId}?sent=${encodeURIComponent(to)}`)
}

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
  redirect(`/quotes/${quoteId}`)
}

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
  redirect(enquiryId ? `/leads/${enquiryId}` : projectId ? `/jobs/${projectId}` : `/quotes/${quoteId}`)
}

export async function deleteQuotesAction(formData: FormData): Promise<void> {
  const cookieStore = await cookies()
  if (!csrfOk(cookieStore.get(CSRF_COOKIE)?.value, formData)) return
  const user = await requireStaff()
  if (!can(user, 'MONEY_ADMIN')) return
  const ids = str(formData, 'ids').split(',').map((s) => s.trim()).filter(Boolean)
  if (ids.length === 0) return
  try {
    await deleteQuotes(ids)
  } catch {
    // fall through to refresh
  }
  revalidatePath('/quotes')
}

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
