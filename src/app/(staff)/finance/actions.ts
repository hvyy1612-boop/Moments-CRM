'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { CSRF_COOKIE, verifyCsrf } from '@/lib/auth/csrf'
import { getSessionUser } from '@/lib/auth/guard'
import { deleteInvoice } from '@/lib/domain/finance'

/** Server actions for the Payments list (bulk operations on the ticked invoices). */

async function requireStaff() {
  const user = await getSessionUser()
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
