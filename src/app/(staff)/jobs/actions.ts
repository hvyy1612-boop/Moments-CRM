'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { appBaseUrl } from '@/lib/app-url'
import { CSRF_COOKIE, verifyCsrf } from '@/lib/auth/csrf'
import { can } from '@/lib/auth/authz'
import { getActionUser } from '@/lib/auth/guard'
import { prisma } from '@/lib/db'
import { JOB_DUE_ANCHORS, parseTaskForm } from '@/features/tasks/due'
import { closeJob } from '@/lib/domain/project'
import {
  addProjectStage,
  addProjectStageBlock,
  addProjectTask,
  deleteProjects,
  deleteProjectStage,
  moveJobBackToLead,
  setJobComplete,
  deleteProjectTask,
  moveProjectTask,
  renameProjectStage,
  toggleProjectTask,
  updateProjectTask,
} from '@/lib/domain/project-workflow'
import { createContractFromAcceptedQuote, sendContract } from '@/lib/domain/contract'
import { createInvoiceWithLines, deleteInvoice, recordPayment, updateInvoiceWithLines, voidInvoice } from '@/lib/domain/finance'
import { refundPayment } from '@/lib/domain/refund'
import { createQuote, saveQuoteDraft, sendQuote } from '@/lib/domain/quote'
import { sendContractEmail, sendQuoteEmail } from '@/lib/email'
import { createInvoiceLinesSchema, recordPaymentSchema } from '@/lib/validation/finance'
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

export async function createQuoteAction(formData: FormData): Promise<void> {
  const cookieStore = await cookies()
  if (!csrfOk(cookieStore.get(CSRF_COOKIE)?.value, formData)) return
  const user = await requireStaff()
  const projectId = String(formData.get('projectId') ?? '')
  if (!projectId) return
  await createQuote(projectId, user.id)
  revalidatePath(`/jobs/${projectId}`)
}

export async function closeJobAction(formData: FormData): Promise<void> {
  const cookieStore = await cookies()
  if (!csrfOk(cookieStore.get(CSRF_COOKIE)?.value, formData)) return
  const user = await requireStaff()
  const projectId = String(formData.get('projectId') ?? '')
  if (!projectId) return
  let closed = false
  try {
    await closeJob(projectId, user.id)
    closed = true
  } catch {
    // Balance outstanding or tasks pending - leave the job as-is; the page reflects the real state.
  }
  revalidatePath(`/jobs/${projectId}`)
  if (closed) redirect(`/jobs/${projectId}?toast=job-closed`)
}

export async function setJobCompleteAction(formData: FormData): Promise<void> {
  const cookieStore = await cookies()
  if (!csrfOk(cookieStore.get(CSRF_COOKIE)?.value, formData)) return
  const user = await requireStaff()
  const projectId = String(formData.get('projectId') ?? '')
  if (!projectId) return
  const done = formData.get('done') === 'true'
  try {
    await setJobComplete(projectId, done, user.id)
  } catch (error) {
    redirect(`/jobs/${projectId}?completeError=${encodeURIComponent(error instanceof Error ? error.message : 'Could not update the job.')}`)
  }
  revalidatePath('/jobs')
  revalidatePath(`/jobs/${projectId}`)
  redirect(`/jobs/${projectId}?toast=${done ? 'job-completed' : 'job-reopened'}`)
}

export async function moveJobBackToLeadAction(formData: FormData): Promise<void> {
  const cookieStore = await cookies()
  if (!csrfOk(cookieStore.get(CSRF_COOKIE)?.value, formData)) return
  const user = await requireStaff()
  const projectId = String(formData.get('projectId') ?? '')
  if (!projectId) return
  let enquiryId: string
  try {
    ;({ enquiryId } = await moveJobBackToLead(projectId, user.id))
  } catch (error) {
    redirect(`/jobs/${projectId}?moveError=${encodeURIComponent(error instanceof Error ? error.message : 'Could not move this job back to Leads.')}`)
  }
  revalidatePath('/jobs')
  revalidatePath('/leads')
  revalidatePath(`/leads/${enquiryId}`)
  redirect(`/leads/${enquiryId}?toast=moved-to-lead`)
}

export async function deleteJobsAction(formData: FormData): Promise<void> {
  const cookieStore = await cookies()
  if (!csrfOk(cookieStore.get(CSRF_COOKIE)?.value, formData)) return
  const user = await requireStaff()
  const ids = String(formData.get('ids') ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  if (ids.length === 0) return
  const { deleted, skipped } = await deleteProjects(ids, user.id)
  revalidatePath('/jobs')
  revalidatePath('/leads')
  redirect(`/jobs?removed=${deleted}&kept=${skipped}`)
}

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

  redirect(`/jobs/${projectId}?sent=${encodeURIComponent(recipient)}`)
}

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

  const enquiryId = String(formData.get('enquiryId') ?? '')
  if (enquiryId) revalidatePath(`/leads/${enquiryId}`)
}

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
  const enquiryId = String(formData.get('enquiryId') ?? '')
  if (enquiryId) revalidatePath(`/leads/${enquiryId}`)
  return { status: 'success' }
}

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

  redirect(`/finance/${created.id}?toast=invoice-created`)
}

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

export async function voidInvoiceAction(formData: FormData): Promise<void> {
  const cookieStore = await cookies()
  if (!csrfOk(cookieStore.get(CSRF_COOKIE)?.value, formData)) return
  const user = await requireStaff()
  if (!can(user, 'MONEY_ADMIN')) return
  const invoiceId = String(formData.get('invoiceId') ?? '')
  if (!invoiceId) return
  let voided = false
  try {
    await voidInvoice(invoiceId, user.id)
    voided = true
  } catch {
    // Refused (e.g. money recorded since the page loaded): the re-render shows the real state.
  }
  revalidatePath('/finance')
  revalidatePath(`/finance/${invoiceId}`)
  const projectId = String(formData.get('projectId') ?? '')
  if (projectId) revalidatePath(`/jobs/${projectId}`)
  if (voided) redirect(`/finance/${invoiceId}?toast=invoice-voided`)
}

export async function deleteInvoiceAction(formData: FormData): Promise<void> {
  const cookieStore = await cookies()
  if (!csrfOk(cookieStore.get(CSRF_COOKIE)?.value, formData)) return
  const user = await requireStaff()
  if (!can(user, 'MONEY_ADMIN')) return
  const invoiceId = String(formData.get('invoiceId') ?? '')
  if (!invoiceId) return
  try {
    await deleteInvoice(invoiceId, user.id)
  } catch {

    revalidatePath(`/finance/${invoiceId}`)
    return
  }
  revalidatePath('/finance')
  const projectId = String(formData.get('projectId') ?? '')
  if (projectId) revalidatePath(`/jobs/${projectId}`)
  const clientId = String(formData.get('clientId') ?? '')
  if (clientId) revalidatePath(`/clients/${clientId}`)

  const back = String(formData.get('back') ?? '')
  if (/^\/(?!\/)/.test(back)) redirect(back + (back.includes('?') ? '&' : '?') + 'toast=invoice-deleted')
  redirect('/finance?toast=invoice-deleted')
}

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

const CALENDAR_TYPES = new Set(['EXTRA_SHOOT', 'APPOINTMENT'])
function readJobTask(formData: FormData, type: string) {
  const parsed = parseTaskForm(formData, { anchors: JOB_DUE_ANCHORS, calendarItem: CALENDAR_TYPES.has(type) })
  return parsed.ok ? parsed : null
}

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
  revalidatePath('/jobs')
}

export async function addProjectTaskAction(formData: FormData): Promise<void> {
  const cookieStore = await cookies()
  if (!csrfOk(cookieStore.get(CSRF_COOKIE)?.value, formData)) return
  const user = await requireStaff()
  const projectId = String(formData.get('projectId') ?? '')
  const stage = String(formData.get('stage') ?? '')
  const type = String(formData.get('type') ?? 'TODO')
  const task = readJobTask(formData, type)
  if (!projectId || !stage || !task) return
  try {
    await addProjectTask(projectId, stage, task.title, type, task.due, user.id)
  } catch {
    // Invalid stage / empty title: the re-render shows the real state.
  }
  revalidatePath(`/jobs/${projectId}`)
}

export async function updateProjectTaskAction(formData: FormData): Promise<void> {
  const cookieStore = await cookies()
  if (!csrfOk(cookieStore.get(CSRF_COOKIE)?.value, formData)) return
  const user = await requireStaff()
  const projectId = String(formData.get('projectId') ?? '')
  const workItemId = String(formData.get('workItemId') ?? '')
  if (!projectId || !workItemId) return
  const existing = await prisma.workItem.findUnique({ where: { id: workItemId }, select: { type: true } })
  const task = existing ? readJobTask(formData, existing.type) : null
  if (!task) return
  try {
    await updateProjectTask(workItemId, task.title, task.due, user.id)
  } catch {
    // no-op on stale id
  }
  revalidatePath(`/jobs/${projectId}`)
}

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

export async function addTeamMemberAction(formData: FormData): Promise<void> {
  const cookieStore = await cookies()
  if (!csrfOk(cookieStore.get(CSRF_COOKIE)?.value, formData)) return
  await requireStaff()
  const projectId = String(formData.get('projectId') ?? '')
  const role = String(formData.get('role') ?? '').trim().slice(0, 80)
  const name = String(formData.get('name') ?? '').trim().slice(0, 150)
  if (!projectId || !role || !name) return
  const sortOrder = await prisma.projectTeamMember.count({ where: { projectId } })
  await prisma.projectTeamMember.create({ data: { projectId, name, role, sortOrder } })
  revalidatePath(`/jobs/${projectId}`)
}

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
  redirect(`/jobs/${projectId}?toast=note-added`)
}

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
  redirect(`/jobs/${projectId}?toast=client-updated`)
}

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
  redirect(`/jobs/${projectId}?toast=note-saved`)
}

export async function deleteInternalNoteAction(formData: FormData): Promise<void> {
  const cookieStore = await cookies()
  if (!csrfOk(cookieStore.get(CSRF_COOKIE)?.value, formData)) return
  await requireStaff()
  const projectId = String(formData.get('projectId') ?? '')
  const communicationId = String(formData.get('communicationId') ?? '')
  if (!projectId || !communicationId) return
  await prisma.communication.deleteMany({ where: { id: communicationId, projectId, internal: true } })
  revalidatePath(`/jobs/${projectId}`)
  redirect(`/jobs/${projectId}?toast=note-deleted`)
}
