'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { appBaseUrl } from '@/lib/app-url'
import { CSRF_COOKIE, verifyCsrf } from '@/lib/auth/csrf'
import { can } from '@/lib/auth/authz'
import { getActionUser } from '@/lib/auth/guard'
import { deleteInvoice, sendInvoice } from '@/lib/domain/finance'

/** Server actions for the Payments list (bulk operations on the ticked invoices) and invoice sending. */

export type SendInvoiceState = { status: 'idle' } | { status: 'error' | 'notice'; message: string }

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Email the invoice to the client (the Send invoice dialog). On a delivered send it REDIRECTS to the
 * invoice with `?sent=` so the confirmation toast is owned by the stable page. When nothing could be
 * emailed the invoice is still issued, and the dialog says exactly that.
 */
export async function sendInvoiceAction(_prev: SendInvoiceState, formData: FormData): Promise<SendInvoiceState> {
  const cookieStore = await cookies()
  if (!verifyCsrf(cookieStore.get(CSRF_COOKIE)?.value, formData.get('csrf'))) {
    return { status: 'error', message: 'Your session expired. Refresh and try again.' }
  }
  const user = await requireStaff()
  const invoiceId = String(formData.get('invoiceId') ?? '')
  const to = String(formData.get('to') ?? '').trim()
  if (!invoiceId) return { status: 'error', message: 'Missing invoice.' }
  if (!EMAIL.test(to)) return { status: 'error', message: "Please enter the client's email address." }

  let outcome: string
  try {
    ;({ outcome } = await sendInvoice(
      invoiceId,
      {
        to,
        subject: String(formData.get('subject') ?? ''),
        body: String(formData.get('message') ?? ''),
        baseUrl: await appBaseUrl(),
      },
      user.id,
    ))
  } catch (error) {
    return { status: 'error', message: error instanceof Error ? error.message : 'Could not send the invoice.' }
  }
  revalidatePath('/finance')
  revalidatePath(`/finance/${invoiceId}`)
  const projectId = String(formData.get('projectId') ?? '')
  if (projectId) revalidatePath(`/jobs/${projectId}`)
  if (outcome === 'ACCEPTED') redirect(`/finance/${invoiceId}?sent=${encodeURIComponent(to)}`)
  return outcome === 'SKIPPED_NO_PROVIDER'
    ? { status: 'notice', message: 'The invoice is issued, but email is not set up yet, so nothing was sent. Share the Client view link with the client instead.' }
    : { status: 'error', message: 'The invoice is issued, but the email could not be delivered. Check the address and try again.' }
}

async function requireStaff() {
  const user = await getActionUser()
  if (!user || (user.role !== 'ADMIN' && user.role !== 'STUDIO')) throw new Error('Not authorised.')
  return user
}

/**
 * Batch-delete the ticked invoices. An invoice with any recorded payment is NEVER silently deleted —
 * `deleteInvoice` throws for those (they must be voided or refunded), and we skip them so the delete is
 * safe by construction. The confirm + the selection live in the client toolbar; here we verify + refresh.
 */
export async function deleteInvoicesAction(formData: FormData): Promise<void> {
  const cookieStore = await cookies()
  if (!verifyCsrf(cookieStore.get(CSRF_COOKIE)?.value, formData.get('csrf'))) return
  const user = await requireStaff()
  if (!can(user, 'MONEY_ADMIN')) return // deleting invoices is ADMIN only (docs/33 §2)
  const ids = String(formData.get('ids') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (ids.length === 0) return
  for (const id of ids) {
    try {
      await deleteInvoice(id, user.id)
    } catch {
      // Skip an invoice that can't be deleted (payments recorded) — it stays in the list.
    }
  }
  revalidatePath('/finance')
}
