'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { appBaseUrl } from '@/lib/app-url'
import { CSRF_COOKIE, verifyCsrf } from '@/lib/auth/csrf'
import { can } from '@/lib/auth/authz'
import { getActionUser } from '@/lib/auth/guard'
import { deleteInvoice, sendInvoice } from '@/lib/domain/finance'

export type SendInvoiceState =
  | { status: 'idle' }
  // `values` = the typed recipient/subject/message, handed back so the dialog keeps them after an error.
  | { status: 'error' | 'notice'; message: string; values?: { to: string; subject: string; message: string } }

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function sendInvoiceAction(_prev: SendInvoiceState, formData: FormData): Promise<SendInvoiceState> {
  const result = await sendInvoiceFromForm(formData)
  if (result.status === 'idle') return result
  const values = { to: String(formData.get('to') ?? ''), subject: String(formData.get('subject') ?? ''), message: String(formData.get('message') ?? '') }
  return { ...result, values }
}

async function sendInvoiceFromForm(formData: FormData): Promise<SendInvoiceState> {
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

export async function deleteInvoicesAction(formData: FormData): Promise<void> {
  const cookieStore = await cookies()
  if (!verifyCsrf(cookieStore.get(CSRF_COOKIE)?.value, formData.get('csrf'))) return
  const user = await requireStaff()
  if (!can(user, 'MONEY_ADMIN')) return
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
  redirect('/finance?toast=invoices-deleted')
}
