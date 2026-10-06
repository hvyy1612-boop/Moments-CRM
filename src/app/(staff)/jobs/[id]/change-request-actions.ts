'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { CSRF_COOKIE, verifyCsrf } from '@/lib/auth/csrf'
import { getActionUser } from '@/lib/auth/guard'
import {
  applyChangeRequest,
  approveChangeRequest,
  assessChangeRequest,
  createChangeRequest,
  recordClientAgreement,
  rejectChangeRequest,
} from '@/lib/domain/change-request'
import { changeRequestPayloadSchema, type ChangeRequestPayload } from '@/lib/validation/change-request'

/**
 * Server actions for the Change Request panel (docs/25 Part 3). Thin form-action wrappers over the
 * domain state machine: they check CSRF + staff, build the typed payload, call the domain, and refresh
 * the job page. Domain errors (drift, missing client agreement, authority, past date) are surfaced back
 * to the panel via a `?crError=` query param so the user sees why a step was blocked.
 */

async function requireStaff() {
  const user = await getActionUser()
  if (!user || (user.role !== 'ADMIN' && user.role !== 'STUDIO')) throw new Error('Not authorised.')
  return user
}
function csrfOk(cookieValue: string | undefined, formData: FormData): boolean {
  return verifyCsrf(cookieValue, formData.get('csrf'))
}
const str = (fd: FormData, k: string): string => String(fd.get(k) ?? '').trim()

/** Build the typed CR payload from the form's `kind` + fields (validated by the Zod union). */
function payloadFromForm(fd: FormData): ChangeRequestPayload {
  const kind = str(fd, 'kind')
  const feeAmount = str(fd, 'feeAmount')
  const fee = feeAmount ? { amount: feeAmount, reason: str(fd, 'feeReason') || null } : undefined
  let raw: unknown
  switch (kind) {
    case 'reschedule':
      raw = { kind, newStartsAt: str(fd, 'newStartsAt'), ...(fee ? { fee } : {}) }
      break
    case 'scopeChange':
      raw = { kind, summary: str(fd, 'summary'), fee: { amount: feeAmount, reason: str(fd, 'feeReason') || null } }
      break
    case 'priceDecrease':
      raw = { kind, invoiceId: str(fd, 'invoiceId'), amount: str(fd, 'amount'), reason: str(fd, 'reason') || null }
      break
    case 'production':
      raw = { kind, summary: str(fd, 'summary'), dueAt: str(fd, 'dueAt') || null, ownerUserId: str(fd, 'ownerUserId') || null }
      break
    default:
      raw = { kind: 'clientData', summary: str(fd, 'summary') }
  }
  return changeRequestPayloadSchema.parse(raw)
}

function backTo(projectId: string, error?: string): never {
  revalidatePath(`/jobs/${projectId}`)
  // Change requests live on the Finance tab: land there so the result (or the reason it was blocked) shows.
  redirect(error ? `/jobs/${projectId}?tab=finance&crError=${encodeURIComponent(error)}#change-requests` : `/jobs/${projectId}?tab=finance#change-requests`)
}

export async function createChangeRequestAction(formData: FormData): Promise<void> {
  const cookieStore = await cookies()
  if (!csrfOk(cookieStore.get(CSRF_COOKIE)?.value, formData)) return
  const user = await requireStaff()
  const projectId = str(formData, 'projectId')
  if (!projectId) return
  try {
    const payload = payloadFromForm(formData)
    await createChangeRequest(
      projectId,
      payload,
      { requestedByType: str(formData, 'requestedByType') === 'client' ? 'client' : 'staff', requestedByUserId: user.id, reason: str(formData, 'crReason') || null },
      user.id,
    )
  } catch (e) {
    backTo(projectId, e instanceof Error ? e.message : 'Could not create the change request.')
  }
  backTo(projectId)
}

/** Run one state-machine transition, mapping the button's `op` to the domain call. */
export async function changeRequestTransitionAction(formData: FormData): Promise<void> {
  const cookieStore = await cookies()
  if (!csrfOk(cookieStore.get(CSRF_COOKIE)?.value, formData)) return
  const user = await requireStaff()
  const projectId = str(formData, 'projectId')
  const id = str(formData, 'changeRequestId')
  const op = str(formData, 'op')
  if (!projectId || !id) return
  try {
    if (op === 'assess') await assessChangeRequest(id, user.id)
    else if (op === 'approve') await approveChangeRequest(id, user.id)
    else if (op === 'agree') await recordClientAgreement(id, { via: str(formData, 'via') || 'email', agreedByUserId: user.id }, user.id)
    else if (op === 'apply') await applyChangeRequest(id, user.id)
    else if (op === 'reject') await rejectChangeRequest(id, str(formData, 'reason') || null, user.id)
    else throw new Error('Unknown action.')
  } catch (e) {
    backTo(projectId, e instanceof Error ? e.message : 'That step could not be completed.')
  }
  backTo(projectId)
}
